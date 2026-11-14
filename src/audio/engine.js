// The audio engine: master bus, one channel per track, live playback and offline rendering.
// It knows nothing about the interface: it plays the song built by core/song.js.
import { INSTRUMENTS } from './instruments/index.js';
import { hz } from './instrument.js';
import { scheduleDrums } from './drums.js';
import { GLIDE } from './glides.js';
import { chordEvents, bassEvents, drumEvents, melodyEvents, limitPolyphony } from '../core/patterns.js';
import { glideOf, slotPitch } from '../core/song.js';
import { createPitchBus } from './pitchbus.js';
import { TRACK_IDS } from '../core/project.js';

const VOICES_LEVEL = 0.06;
const CHANNEL_HP = { voices: 20, drums: 30 };

/** What a track's fader, mute and solo add up to, as a linear gain. 0.8 on the fader is unity. */
export function trackGain(tracks, id) {
  const t = tracks[id], anySolo = TRACK_IDS.some(k => tracks[k].solo);
  if (t.mute || (anySolo && !t.solo)) return 0;
  const v = t.volume / 0.8; return v * v;
}

/** Master bus: gentle low cut, a soft compressor, and a generated reverb (no impulse file). */
function buildMaster(ac) {
  const out = ac.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 3; out.connect(ac.destination);
  // tame the low end before the compressor so low bass notes do not make it pump
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 75; hp.Q.value = 0.7;
  const ls = ac.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 140; ls.gain.value = -9;
  hp.connect(ls); ls.connect(out);
  const rev = ac.createConvolver(), len = Math.floor(ac.sampleRate * 2.6), buf = ac.createBuffer(2, len, ac.sampleRate);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  rev.buffer = buf;
  const wet = ac.createGain(); wet.gain.value = 0.32; rev.connect(wet); wet.connect(hp);
  const bus = ac.createGain(); bus.gain.value = 0.9; bus.connect(hp); bus.connect(rev);
  return { bus, out };
}

/** A pitch bus that stays at 0 cents: a voice that does not move. */
function steady(ac, start, stop) { const b = ac.createConstantSource(); b.offset.value = 0; b.start(start); b.stop(stop); return b; }

/** One channel per track: input → low cut → balance × fader → pan → session bus. */
function buildChannel(ac, dest, tracks, id, instrument) {
  const input = ac.createGain();
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.7;
  hp.frequency.value = instrument ? instrument.highpass : CHANNEL_HP[id] || 40;
  const trim = ac.createGain(); trim.gain.value = instrument ? instrument.level : 1;
  const vol = ac.createGain(); vol.gain.value = trackGain(tracks, id);
  input.connect(hp); hp.connect(trim); trim.connect(vol);
  let pan = null;
  if (ac.createStereoPanner) { pan = ac.createStereoPanner(); pan.pan.value = tracks[id].pan; vol.connect(pan); pan.connect(dest); } else vol.connect(dest);
  return { input, vol, pan };
}

/** The gliding voices: six continuous voices whose pitch slides from chord to chord, in the chosen glide sound. */
function scheduleVoices(ac, out, song, abs) {
  const S = song.starts, n = S.length, endAbs = abs(song.end), st = Math.max(0, abs(S[0]) - 0.1), stop = endAbs + 4;
  const sound = GLIDE[song.tracks.voices.sound] || GLIDE.pad;
  const trim = ac.createGain(); trim.gain.value = sound.level; trim.connect(out);
  // one vibrato for the whole section, so the voices breathe together
  let vib = null;
  if (sound.vibrato.length) {
    vib = ac.createGain(); vib.gain.value = 1;
    for (const [rate, cents] of sound.vibrato) { const l = ac.createOscillator(); l.frequency.value = rate; const d = ac.createGain(); d.gain.value = cents; l.connect(d); d.connect(vib); l.start(st); l.stop(stop); }
  }
  for (let k = 0; k < 6; k++) {
    const moves = []; for (let i = 1; i < n; i++) if (slotPitch(song, i, k) !== slotPitch(song, i - 1, k)) moves.push(abs(S[i]));
    const { bus, base } = createPitchBus(ac, song, k, abs, st, stop, hz);
    sound.voice(ac, trim, {
      k, bass: k === 0, start: st, stop, vib, moves, bus, base,
      amp(param, scale = 1) {
        param.setValueAtTime(0, ac.currentTime);
        for (let i = 0; i < n; i++) {
          // a voice that doubles a lower one stays silent, so unisons do not get louder
          let dup = false; for (let j = 0; j < k; j++) if (slotPitch(song, i, j) === slotPitch(song, i, k)) dup = true;
          const lv = dup ? 0 : (k === 0 ? VOICES_LEVEL * 1.05 : VOICES_LEVEL) * scale, gl = i ? glideOf(song, i) : 0;
          param.setTargetAtTime(lv, abs(S[i] - gl), i ? Math.max(0.08, gl / 3) : 0.12);
        }
        param.setTargetAtTime(0, endAbs, 0.08);
      },
    });
  }
}

function scheduleNotes(ac, out, inst, events, abs, live, span) {
  const shared = inst.setup ? inst.setup(ac, out, span) : undefined;
  for (const e of limitPolyphony(events, inst.maxVoices)) {
    const time = abs(e.t);
    // live preview: a note that should already have started is skipped, never fired late in a burst
    if (live && time < ac.currentTime + 0.005) continue;
    inst.note(ac, out, { midi: e.m, freq: hz(e.m), time, duration: e.d, velocity: e.v }, shared);
  }
}

/**
 * Schedule a whole song on a context. `t0` is the context time of the song's time zero.
 * Returns the channels, so a live mix can be adjusted while it plays.
 */
export function scheduleSong(ac, dest, song, t0, opts = {}) {
  const live = !!opts.live, tracks = song.tracks;
  const abs = t => Math.max(0, t0 + t);
  /** @type {import('../core/patterns.js').Span} */
  const span = { lo: song.vs - 4, hi: song.ve + 1, from: live ? opts.from : undefined };
  const life = { start: Math.max(0, ac.currentTime), end: abs(song.end) + 8 };
  const chordInst = INSTRUMENTS[tracks.chords.instrument] || null;
  const bassInst = INSTRUMENTS[tracks.bass.instrument] || INSTRUMENTS.softpiano;
  const melodyInst = INSTRUMENTS[tracks.melody.instrument] || INSTRUMENTS.softpiano;
  const inst = { voices: null, chords: chordInst, bass: bassInst, drums: null, melody: melodyInst };
  /** @type {Record<string, ReturnType<typeof buildChannel>>} */
  const ch = {};
  for (const id of TRACK_IDS) ch[id] = buildChannel(ac, dest, tracks, id, inst[id]);
  scheduleVoices(ac, ch.voices.input, song, abs);
  if (chordInst) scheduleNotes(ac, ch.chords.input, chordInst, chordEvents(song, chordInst.style, span), abs, live, life);
  scheduleNotes(ac, ch.bass.input, bassInst, bassEvents(song, tracks.bass.pattern, span), abs, live, life);
  scheduleNotes(ac, ch.melody.input, melodyInst, melodyEvents(song, tracks.melody.notes, span), abs, live, life);
  scheduleDrums(ac, ch.drums.input, drumEvents(song, tracks.drums.pattern, span), abs, live);
  return ch;
}

/**
 * Render one seamless loop of the song offline. Resolves with a stereo AudioBuffer that holds exactly
 * [song.vs, song.ve]: the reverb tail of the loop's end is already under its start.
 * @returns {Promise<AudioBuffer>}
 */
export async function renderLoop(song, sampleRate = 48000) {
  const Ctor = /** @type {typeof OfflineAudioContext} */(globalThis.OfflineAudioContext || /** @type {any} */(globalThis).webkitOfflineAudioContext);
  if (!Ctor) throw new Error('offline audio rendering is not available in this browser');
  const pre = 0.12, total = pre + song.ve + 0.3;
  const oac = new Ctor(2, Math.ceil(sampleRate * total), sampleRate);
  const master = buildMaster(oac);
  scheduleSong(oac, master.bus, song, pre);
  const full = await oac.startRendering();
  const skip = Math.round((pre + song.vs) * sampleRate), len = Math.round(song.cycle * sampleRate);
  const out = oac.createBuffer(2, len, sampleRate);
  for (let c = 0; c < 2; c++) out.getChannelData(c).set(full.getChannelData(c).subarray(skip, skip + len));
  return out;
}

/** Live playback. One engine for the whole app. */
export function createEngine() {
  /** @type {AudioContext|null} */ let ac = null;
  /** @type {ReturnType<typeof buildMaster>|null} */ let master = null;
  /** @type {GainNode|null} */ let sess = null;
  /** @type {Record<string, ReturnType<typeof buildChannel>>|null} */ let chans = null;
  let t0 = 0, playing = false;
  /** @type {GainNode|null} */ let audit = null;

  function ensure() {
    if (ac) return ac;
    const Ctor = globalThis.AudioContext || /** @type {any} */(globalThis).webkitAudioContext;
    if (!Ctor) throw new Error('This browser cannot play sound (no Web Audio).');
    ac = new Ctor(); master = buildMaster(ac);
    return ac;
  }
  function stop() {
    if (sess && ac) {
      const s = sess; s.gain.setTargetAtTime(0, ac.currentTime, 0.04);
      setTimeout(() => { try { s.disconnect(); } catch (e) { /* already gone */ } }, 600);
    }
    sess = null; chans = null; playing = false;
  }
  return {
    get context() { return ac; },
    get playing() { return playing; },
    /** Call from a tap or key press: creates the context and resumes it (browsers start it suspended). */
    unlock() {
      const a = ensure();
      // iOS: mark the page as media playback, so the ring/silent switch does not mute it
      try { const s = /** @type {any} */(navigator).audioSession; if (s && s.type !== 'playback') s.type = 'playback'; } catch (e) { /* not supported */ }
      if (a.state !== 'running') a.resume().catch(() => {});
      return a;
    },
    /** True when the browser has paused the context (phone call, another app, background). The next tap resumes it. */
    get interrupted() { return !!ac && ac.state !== 'running'; },
    /** Start playing `song` from song time `from`. Must follow a user gesture at least once. */
    play(song, from) {
      const a = this.unlock(); stop();
      if (audit) { audit.gain.setTargetAtTime(0, a.currentTime, 0.03); audit = null; }
      sess = a.createGain(); sess.connect(/** @type {any} */(master).bus);
      t0 = a.currentTime + 0.15 - from;
      try { chans = scheduleSong(a, sess, song, t0, { live: true, from }); } catch (e) { stop(); throw e; }
      playing = true;
    },
    stop,
    /** Song time of the play head. */
    time() { return ac ? ac.currentTime - t0 : 0; },
    /** Apply fader, pan, mute and solo changes to what is playing, without a restart. */
    setMix(tracks) {
      if (!chans || !ac) return;
      for (const id of TRACK_IDS) {
        chans[id].vol.gain.setTargetAtTime(trackGain(tracks, id), ac.currentTime, 0.03);
        const p = chans[id].pan; if (p) p.pan.setTargetAtTime(tracks[id].pan, ac.currentTime, 0.03);
      }
    },
    /** Let one chord of the song be heard on its own, in the current glide sound (about a second and a half). */
    auditionVoices(song, i) { this.auditionNotes([song.v[i].bass, ...new Set(song.v[i].upper)], song.tracks.voices.sound); },
    /** Play these notes together in a glide sound, with a soft start and end. */
    auditionNotes(midis, soundId) {
      if (playing) return;
      const a = this.unlock(), sound = GLIDE[soundId] || GLIDE.pad, m = /** @type {any} */(master);
      if (audit) { const old = audit; old.gain.setTargetAtTime(0, a.currentTime, 0.03); setTimeout(() => { try { old.disconnect(); } catch (e) { /* gone */ } }, 400); }
      const g = a.createGain(); g.gain.value = sound.level; g.connect(m.bus); audit = g;
      const t0 = a.currentTime + 0.03, hold = 1.1, stop = t0 + hold + 1.2;
      let vib = null;
      if (sound.vibrato.length) { vib = a.createGain(); for (const [rate, cents] of sound.vibrato) { const l = a.createOscillator(); l.frequency.value = rate; const d = a.createGain(); d.gain.value = cents; l.connect(d); d.connect(vib); l.start(t0); l.stop(stop); } }
      [...new Set(midis)].sort((x, y) => x - y).forEach((midi, k) => sound.voice(a, g, {
        k, bass: k === 0, start: t0, stop, vib, moves: [t0], bus: steady(a, t0, stop), base: hz(midi),
        amp(param, scale = 1) { param.setValueAtTime(0, a.currentTime); param.setTargetAtTime(VOICES_LEVEL * scale, t0, 0.04); param.setTargetAtTime(0, t0 + hold, 0.18); },
      }));
      setTimeout(() => { if (audit === g) audit = null; try { g.disconnect(); } catch (e) { /* gone */ } }, (hold + 1.4) * 1000);
    },
    /** Play a few notes right now with an instrument (the chord picker uses it so choices can be heard). */
    audition(midis, instrumentId) {
      const a = this.unlock(), inst = INSTRUMENTS[instrumentId] || INSTRUMENTS.softpiano, m = /** @type {any} */(master);
      const g = a.createGain(); g.gain.value = inst.level; g.connect(m.bus);
      const life = { start: a.currentTime, end: a.currentTime + 8 }, shared = inst.setup ? inst.setup(a, g, life) : undefined;
      midis.forEach((midi, k) => inst.note(a, g, { midi, freq: hz(midi), time: a.currentTime + 0.04 + k * 0.012, duration: 1.1, velocity: 0.9 }, shared));
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* already gone */ } }, 8000);
    },
    /** A MediaStream of the master output, for real-time recording. Call release() when done. */
    tap() {
      const a = ensure(), dest = a.createMediaStreamDestination(), out = /** @type {any} */(master).out;
      out.connect(dest);
      return { stream: dest.stream, release() { try { out.disconnect(dest); } catch (e) { /* already gone */ } } };
    },
  };
}
