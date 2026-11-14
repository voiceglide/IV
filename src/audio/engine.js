// The audio engine: master bus, one channel per track, live playback and offline rendering.
// It knows nothing about the interface: it plays the song built by core/song.js.
//
// A song is scheduled in PASSES. One pass is one trip through the loop window [vs, ve]. A looping play schedules
// pass after pass a little ahead of the clock (lookahead), each one starting exactly where the last one ends, so the
// loop has no gap: the voices cross-fade for 40 ms across the boundary, notes simply ring on.
import { INSTRUMENTS } from './instruments/index.js';
import { hz } from './instrument.js';
import { scheduleDrums } from './drums.js';
import { GLIDE } from './glides/index.js';
import { chordEvents, bassEvents, drumEvents, melodyEvents, limitPolyphony } from '../core/patterns.js';
import { glideOf, slotPitch, idxAt } from '../core/song.js';
import { TRACK_IDS } from '../core/project.js';
import { createPitchBus } from './pitchbus.js';

const VOICES_LEVEL = 0.06;
const CHANNEL_HP = { voices: 20, drums: 30 };
/** How much of each track goes to the reverb (a send per track: the bass stays dry and clear, the voices float). */
const REVERB_SEND = { voices: 0.3, chords: 0.3, bass: 0.04, drums: 0.1, melody: 0.32 };
const XF = 0.04;          // cross-fade of the gliding voices across the loop boundary
const LOOKAHEAD = 1.5;    // seconds: the next pass is scheduled this long before it starts
const CEILING = 0.88;     // nothing leaves the master above this (−1.1 dBFS)

/** What a track's fader, mute and solo add up to, as a linear gain. 0.8 on the fader is unity. */
export function trackGain(tracks, id) {
  const t = tracks[id], anySolo = TRACK_IDS.some(k => tracks[k].solo);
  if (t.mute || (anySolo && !t.solo)) return 0;
  const v = t.volume / 0.8; return v * v;
}

/** A reverb impulse made of noise: a pre-delay, an exponential decay, and high frequencies that die faster than lows (damping). */
function reverbImpulse(ac, seconds = 2.4, preDelay = 0.022) {
  const sr = ac.sampleRate, len = Math.floor(sr * seconds), pre = Math.floor(sr * preDelay), buf = ac.createBuffer(2, len, sr);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre), env = Math.pow(1 - x, 2.4) * Math.min(1, (i - pre) / (sr * 0.012)); // soft onset: no click
      const a = 0.9 - 0.82 * Math.pow(x, 0.5);          // one-pole low-pass that closes as the tail goes on
      lp += a * ((rnd() * 2 - 1) - lp);
      d[i] = lp * env * 1.6;
    }
  }
  return buf;
}

/** Soft ceiling: untouched up to 0.8, then rounds off towards CEILING. The last line of defence after the limiter. */
function ceilingCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + (CEILING - 0.8) * Math.tanh((a - 0.8) / (CEILING - 0.8))); }
  return c;
}

/**
 * Master bus: a subsonic filter (20 Hz, so the bass keeps its weight), a gentle compressor, a limiter, a soft ceiling,
 * and a generated reverb that the tracks feed through their own sends. `dry` skips all of it (tests of a sound alone).
 */
function buildMaster(ac, dry = false) {
  const out = ac.createGain(); out.gain.value = 1; out.connect(ac.destination);
  if (dry) { const bus = ac.createGain(); bus.connect(out); return { bus, rev: null, out }; }
  const shaper = ac.createWaveShaper(); shaper.curve = ceilingCurve(); shaper.oversample = '4x'; shaper.connect(out);
  const limiter = ac.createDynamicsCompressor(); limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.09;
  limiter.connect(shaper);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 2.5; comp.attack.value = 0.012; comp.release.value = 0.25;
  comp.connect(limiter);
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 20; hp.Q.value = 0.7; hp.connect(comp);
  const rev = ac.createConvolver(); rev.buffer = reverbImpulse(ac);
  const revIn = ac.createGain(); revIn.gain.value = 1; revIn.connect(rev);
  const wet = ac.createGain(); wet.gain.value = 0.9; rev.connect(wet); wet.connect(hp);
  const bus = ac.createGain(); bus.gain.value = 0.64; bus.connect(hp);
  return { bus, rev: revIn, out };
}

/**
 * One channel per track: input → low cut → balance × fader → pan → dry bus, and a send to the reverb.
 * `dest` is a node (dry only) or {dry, wet} (a live session: both are faded together when it stops).
 */
function buildChannel(ac, dest, tracks, id, instrument) {
  const dry = /** @type {any} */(dest).dry || dest, wet = /** @type {any} */(dest).wet || null;
  const input = ac.createGain();
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.7;
  hp.frequency.value = instrument ? instrument.highpass : CHANNEL_HP[id] || 40;
  const trim = ac.createGain(); trim.gain.value = instrument ? instrument.level : 1;
  const vol = ac.createGain(); vol.gain.value = trackGain(tracks, id);
  input.connect(hp); hp.connect(trim); trim.connect(vol);
  let pan = null, tail = vol;
  if (ac.createStereoPanner) { pan = ac.createStereoPanner(); pan.pan.value = tracks[id].pan; vol.connect(pan); tail = pan; }
  tail.connect(dry);
  if (wet) { const send = ac.createGain(); send.gain.value = REVERB_SEND[id] || 0; tail.connect(send); send.connect(wet); }
  return { input, vol, pan };
}

/** @typedef {Record<string, ReturnType<typeof buildChannel>>} Channels */
function buildChannels(ac, dest, tracks) {
  const chordInst = INSTRUMENTS[tracks.chords.instrument] || null;
  const bassInst = INSTRUMENTS[tracks.bass.instrument] || INSTRUMENTS.softpiano;
  const melodyInst = INSTRUMENTS[tracks.melody.instrument] || INSTRUMENTS.softpiano;
  const inst = { voices: null, chords: chordInst, bass: bassInst, drums: null, melody: melodyInst };
  /** @type {Channels} */ const ch = {};
  for (const id of TRACK_IDS) ch[id] = buildChannel(ac, dest, tracks, id, inst[id]);
  return { ch, chordInst, bassInst, melodyInst };
}

/** Which glide sound voice k plays: bass, top and inner voices may each have their own (tracks.voices.split), else the main one. */
export function soundOf(tracks, k) {
  const sp = tracks.voices.split || {}, id = (k === 0 ? sp.bass : k === 1 ? sp.top : sp.inner) || tracks.voices.sound;
  return GLIDE[id] || GLIDE.pad;
}

/**
 * The gliding voices: six continuous voices whose pitch slides from chord to chord, each in its glide sound.
 * o.lo / o.hi: song times between which the voices exist. o.cont: this pass continues a running loop (voices begin at
 * full level, cross-faded in over XF). o.fade: length of the fade-out at hi. o.only: build just this voice (tests).
 * Returns the nodes to stop when the play is stopped.
 */
function scheduleVoices(ac, out, song, abs, o) {
  const S = song.starts, n = S.length, lo = o.lo, hi = o.hi, loC = abs(lo), hiC = abs(hi), fade = o.fade;
  const style = song.glideStyle || { curve: 'eased', vibrato: 0.5, swell: 0.5 }, depth = 2 * style.vibrato, sw = style.swell;
  const st = o.cont ? loC : Math.max(0, loC - 0.1), stop = hiC + 0.15;
  /** @type {any[]} */ const reg = [];
  const pass = ac.createGain(); pass.connect(out);
  const ramp = (up) => { const a = new Float32Array(24); for (let j = 0; j < 24; j++) { const u = j / 23; a[j] = up ? Math.sin(u * Math.PI / 2) : Math.cos(u * Math.PI / 2); } return a; };
  pass.gain.value = o.cont ? 0 : 1;
  if (o.cont) pass.gain.setValueCurveAtTime(ramp(true), loC, XF);
  pass.gain.setValueCurveAtTime(ramp(false), Math.max(hiC - fade, o.cont ? loC + XF : 0), fade);
  /** @type {Map<string, {trim: GainNode, lfo: GainNode|null}>} */ const groups = new Map();
  const group = sound => {
    let g = groups.get(sound.id);
    if (!g) {
      const trim = ac.createGain(); trim.gain.value = sound.level; trim.connect(pass);
      let lfo = null;
      if (sound.vibrato.length) {
        lfo = ac.createGain(); lfo.gain.value = 1;
        for (const [rate, cents] of sound.vibrato) { const l = ac.createOscillator(); l.frequency.value = rate; const d = ac.createGain(); d.gain.value = cents; l.connect(d); d.connect(lfo); l.start(st); l.stop(stop); reg.push(l); }
      }
      g = { trim, lfo }; groups.set(sound.id, g);
    }
    return g;
  };
  for (let k = 0; k < 6; k++) {
    if (o.only !== undefined && o.only !== k) continue;
    const sound = soundOf(song.tracks, k), grp = group(sound);
    const moved = i => slotPitch(song, i, k) !== slotPitch(song, i - 1, k);
    const moves = []; for (let i = 1; i < n; i++) if (moved(i) && S[i] >= lo && S[i] <= hi) moves.push(abs(S[i]));
    const { bus, base } = createPitchBus(ac, song, k, abs, st, stop, hz, o.cont ? loC : ac.currentTime, hi);
    reg.push(bus);
    // vibrato: its own fade, so it appears once the voice has arrived (not from the first instant) and goes while the voice slides
    let vib = null;
    if (grp.lfo && depth > 0) {
      vib = ac.createGain(); grp.lfo.connect(vib); const g = vib.gain;
      const idx = idxAt(song, lo), sliding = idx + 1 < n && lo >= S[idx + 1] - glideOf(song, idx + 1) && moved(idx + 1);
      g.setValueAtTime(o.cont && !sliding ? depth : 0, 0);
      if (!o.cont) g.setTargetAtTime(depth, abs(S[0]) + 0.15, 0.3);
      for (let i = 1; i < n; i++) {
        if (!moved(i) || S[i] <= lo) continue;
        const gl = glideOf(song, i); if (S[i] - gl > hi) break;
        g.setTargetAtTime(0, abs(S[i] - gl), 0.04); g.setTargetAtTime(depth, abs(S[i]) + 0.15, 0.3);
      }
    }
    const lvl = (i, scale) => {
      // a voice that doubles a lower one stays silent, so unisons do not get louder
      for (let j = 0; j < k; j++) if (slotPitch(song, i, j) === slotPitch(song, i, k)) return 0;
      return (k === 0 ? VOICES_LEVEL * 1.05 : VOICES_LEVEL) * scale;
    };
    sound.voice(ac, grp.trim, {
      k, bass: k === 0, start: st, stop, vib, moves, bus, base, swell: sw, reg,
      amp(param, scale = 1) {
        let i0 = 0;
        if (o.cont) {
          let i = idxAt(song, lo); if (i + 1 < n && lo >= S[i + 1] - glideOf(song, i + 1)) i++;
          param.setValueAtTime(lvl(i, scale), 0); i0 = i + 1;
        } else param.setValueAtTime(0, ac.currentTime);
        for (let i = i0; i < n; i++) {
          const gl = i ? glideOf(song, i) : 0, tg = S[i] - gl; if (tg > hi) break;
          const lv = lvl(i, scale);
          param.setTargetAtTime(lv, abs(tg), i ? Math.max(0.08, gl / 3) : 0.12);
          // a soft swell as the voice lands on a new note
          if (i && sw > 0 && lv > 0 && moved(i)) { param.setTargetAtTime(lv * (1 + 0.5 * sw), abs(S[i] - gl * 0.4), 0.1); param.setTargetAtTime(lv, abs(S[i]) + 0.12, 0.35); }
        }
      },
    });
  }
  return reg;
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
 * Schedule one pass of a song on built channels. t0 is the context time of song time zero.
 * o.live: from the play head on (notes already due are skipped) · o.from: the play head, song time
 * o.win: [lo, hi) only notes that START in this window are played (loop passes) · o.cont / o.voices: see scheduleVoices
 * o.only: just that voice · o.noVoices / o.skip: leave tracks out (tests).
 */
function schedulePass(ac, built, song, t0, o) {
  const { ch, chordInst, bassInst, melodyInst } = built, tracks = song.tracks;
  const abs = t => Math.max(0, t0 + t);
  const win = o.win || [-Infinity, Infinity], inWin = e => e.t >= win[0] && e.t < win[1];
  const end = o.voices.hi;
  /** @type {import('../core/patterns.js').Span} */
  const span = { lo: song.vs - 4, hi: song.ve + 1, from: o.live ? o.from : undefined };
  const life = { start: Math.max(0, ac.currentTime, abs(Number.isFinite(win[0]) ? win[0] : song.vs) - 0.05), end: abs(end) + 8 };
  const skip = o.skip || [];
  let reg = [];
  if (!skip.includes('voices')) reg = scheduleVoices(ac, ch.voices.input, song, abs, { ...o.voices, only: o.only });
  if (chordInst && !skip.includes('chords')) scheduleNotes(ac, ch.chords.input, chordInst, chordEvents(song, chordInst.style, span).filter(inWin), abs, !!o.live, life);
  if (!skip.includes('bass')) scheduleNotes(ac, ch.bass.input, bassInst, bassEvents(song, tracks.bass.pattern, span).filter(inWin), abs, !!o.live, life);
  if (!skip.includes('melody')) scheduleNotes(ac, ch.melody.input, melodyInst, melodyEvents(song, tracks.melody.notes, span).filter(inWin), abs, !!o.live, life);
  if (!skip.includes('drums')) scheduleDrums(ac, ch.drums.input, drumEvents(song, tracks.drums.pattern, span).filter(inWin), abs, !!o.live);
  return reg;
}

/**
 * Schedule a whole song once (no loop) on a context. `t0` is the context time of the song's time zero.
 * Returns the channels, so a live mix can be adjusted while it plays.
 */
export function scheduleSong(ac, dest, song, t0, opts = {}) {
  const built = buildChannels(ac, dest, song.tracks);
  schedulePass(ac, built, song, t0, { live: !!opts.live, from: opts.from, voices: { lo: song.starts[0], hi: song.end, fade: 0.3, cont: false } });
  return built.ch;
}

/**
 * A looping play: passes of [vs, ve) scheduled one after the other, seamlessly.
 * `playAt` is the context time at which song time `from` should sound.
 */
function createLooper(ac, built, song0, playAt, from, opts = {}) {
  const song = Object.assign({}, song0, { loop: true });
  const { vs, ve, cycle } = song;
  from = Math.min(Math.max(from, vs), ve - 0.01);
  const t0 = playAt - from;
  /** @type {any[]} */ let reg = [];
  let k = 0;
  const startOf = j => t0 + j * cycle + vs;      // context time at which pass j begins (song time vs)
  function schedule() {
    const first = k === 0, T = t0 + k * cycle;
    reg.push(...schedulePass(ac, built, song, T, {
      live: first && !!opts.live, from: first ? from : undefined, only: opts.only, skip: opts.skip,
      win: first ? [opts.live ? -Infinity : vs, ve] : [vs, ve],
      voices: first ? { lo: song.starts[0], hi: ve + XF / 2, fade: XF, cont: false } : { lo: vs - XF / 2, hi: ve + XF / 2, fade: XF, cont: true },
    }));
    k++;
  }
  return {
    /** Schedule every pass that starts within the lookahead. */
    pump() { while (startOf(k) - LOOKAHEAD <= ac.currentTime) schedule(); },
    /** Schedule exactly n passes (offline). */
    all(n) { while (k < n) schedule(); },
    /** Song time at context time `now`, wrapped into the loop window. */
    timeAt(now) { const t = now - t0; return t < ve ? t : vs + ((t - vs) % cycle); },
    kill(at) { for (const s of reg) { try { s.stop(at); } catch (e) { /* not started or already over */ } } reg = []; },
  };
}

/**
 * Render the loop offline. Resolves with a stereo AudioBuffer that holds exactly one cycle, [song.vs, song.ve]: it is
 * rendered from several passes of the same machinery as the live loop (at least max(cycle, 3 s) of warm-up, so the reverb
 * is full), then its first 40 ms are cross-faded (equal power) with the audio that follows the loop's end, so the end
 * runs into the start without a step.
 * opts.raw: return the passes as they are, no window or cross-fade (opts.passes of them) · opts.dry: no master, no reverb
 * opts.solo: only this track · opts.voice: only this gliding voice (tests)
 * @returns {Promise<AudioBuffer>}
 */
export async function renderLoop(song, sampleRate = 48000, opts = {}) {
  const Ctor = /** @type {typeof OfflineAudioContext} */(globalThis.OfflineAudioContext || /** @type {any} */(globalThis).webkitOfflineAudioContext);
  if (!Ctor) throw new Error('offline audio rendering is not available in this browser');
  const cycle = song.cycle, pre = Math.ceil(Math.max(cycle, 3) / cycle), passes = opts.raw ? (opts.passes || 3) : pre + 2;
  const lead = 0.3, total = lead + passes * cycle + 0.4;
  const oac = new Ctor(2, Math.ceil(sampleRate * total), sampleRate);
  const master = buildMaster(oac, !!opts.dry);
  const built = buildChannels(oac, { dry: master.bus, wet: master.rev }, song.tracks);
  /** @type {string[]} */ const skip = opts.voice !== undefined ? TRACK_IDS.filter(id => id !== 'voices') : opts.solo ? TRACK_IDS.filter(id => id !== opts.solo) : [];
  const looper = createLooper(oac, built, song, lead, song.vs, { only: opts.voice, skip });
  looper.all(passes);
  const full = await oac.startRendering();
  const s = Math.round((lead + pre * cycle) * sampleRate), len = Math.round(cycle * sampleRate);
  if (opts.raw) { const out = oac.createBuffer(2, full.length - Math.round(lead * sampleRate), sampleRate); for (let c = 0; c < 2; c++) out.getChannelData(c).set(full.getChannelData(c).subarray(Math.round(lead * sampleRate))); return out; }
  const out = oac.createBuffer(2, len, sampleRate), F = Math.min(Math.round(0.04 * sampleRate), len >> 1);
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c), r = full.getChannelData(c);
    d.set(r.subarray(s, s + len));
    // i = 0 continues the end of the window (r[s + len]); by i = F it is the window's own start (r[s + F])
    for (let i = 0; i < F; i++) { const u = i / F; d[i] = Math.cos(u * Math.PI / 2) * r[s + len + i] + Math.sin(u * Math.PI / 2) * r[s + i]; }
  }
  return out;
}

/** A pitch bus that stays at 0 cents: a voice that does not move. */
function steady(ac, start, stop) { const b = ac.createConstantSource(); b.offset.value = 0; b.start(start); b.stop(stop); return b; }

/** Live playback. One engine for the whole app. */
export function createEngine() {
  /** @type {AudioContext|null} */ let ac = null;
  /** @type {ReturnType<typeof buildMaster>|null} */ let master = null;
  /** @type {{dry: GainNode, wet: GainNode}|null} */ let sess = null;
  /** @type {Channels|null} */ let chans = null;
  /** @type {ReturnType<typeof createLooper>|null} */ let looper = null;
  /** @type {any} */ let timer = null;
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
    if (timer) { clearInterval(timer); timer = null; }
    if (sess && ac) {
      const s = sess; s.dry.gain.setTargetAtTime(0, ac.currentTime, 0.04); s.wet.gain.setTargetAtTime(0, ac.currentTime, 0.04);
      if (looper) looper.kill(ac.currentTime + 0.4);
      setTimeout(() => { try { s.dry.disconnect(); s.wet.disconnect(); } catch (e) { /* already gone */ } }, 600);
    }
    sess = null; chans = null; looper = null; playing = false;
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
    /**
     * Start playing `song` from song time `from`. Must follow a user gesture at least once.
     * With `{loop: true}` the engine keeps scheduling the loop itself, with no gap at the boundary: time() then stays
     * inside [song.vs, song.ve) and the caller never has to restart playback.
     */
    play(song, from, opts = {}) {
      const a = this.unlock(); stop();
      if (audit) { audit.gain.setTargetAtTime(0, a.currentTime, 0.03); audit = null; }
      const m = /** @type {any} */(master);
      const dry = a.createGain(), wet = a.createGain(); dry.connect(m.bus); wet.connect(m.rev);
      sess = { dry, wet };
      try {
        const built = buildChannels(a, sess, song.tracks); chans = built.ch;
        if (opts.loop) {
          looper = createLooper(a, built, song, a.currentTime + 0.15, from, { live: true });
          t0 = a.currentTime + 0.15 - Math.min(Math.max(from, song.vs), song.ve - 0.01);
          looper.pump(); const lp = looper; timer = setInterval(() => lp.pump(), 200);
        } else {
          t0 = a.currentTime + 0.15 - from;
          schedulePass(a, built, song, t0, { live: true, from, voices: { lo: song.starts[0], hi: song.end, fade: 0.3, cont: false } });
        }
      } catch (e) { stop(); throw e; }
      playing = true;
    },
    stop,
    /** Song time of the play head (in a loop: always inside [vs, ve)). */
    time() { if (!ac) return 0; return looper ? looper.timeAt(ac.currentTime) : ac.currentTime - t0; },
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
        k, bass: k === 0, start: t0, stop, vib, moves: [t0], bus: steady(a, t0, stop), base: hz(midi), swell: 0.5,
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
