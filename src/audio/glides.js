// Glide sounds: the voices of the chords. Unlike the struck instruments, each one is a continuous sound whose
// pitch is driven by the engine and slides from chord to chord. A glide sound only decides the timbre.
//
// voice(ac, out, v) builds one voice. The engine hands it:
//   v.k        voice number (0 = bass, 1…5 upper voices from the top down), v.bass
//   v.start, v.stop           when sources may start and must stop
//   v.pitch(param, ratio)     schedules this voice's sliding pitch on a frequency AudioParam (× ratio for partials)
//   v.amp(param, scale)       schedules this voice's loudness (fade in, doubled voices muted, fade out)
//   v.vib                     a node carrying the shared vibrato, in cents: connect it to osc.detune (or null)
//   v.moves                   times at which this voice arrives on a new note (for swells)
import { noiseBuffer } from './instruments/kit.js';

function osc(ac, v, type, ratio = 1, cents = 0) {
  const o = ac.createOscillator(); o.type = type; v.pitch(o.frequency, ratio); o.detune.value = cents;
  if (v.vib) v.vib.connect(o.detune);
  o.start(v.start); o.stop(v.stop);
  return o;
}
function mix(ac, sources) {
  const sum = ac.createGain(); sum.gain.value = 1;
  for (const [node, gain] of sources) { const g = ac.createGain(); g.gain.value = gain; node.connect(g); g.connect(sum); }
  return sum;
}
function lowpass(ac, f, q = 0.7) { const b = ac.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; }
function out(ac, v, node, dest, scale) { const g = ac.createGain(); g.gain.value = 0; v.amp(g.gain, scale); node.connect(g); g.connect(dest); return g; }
/** Vowel: a few band-pass filters in parallel. */
function formants(ac, src, list) {
  const sum = ac.createGain(); sum.gain.value = 1;
  for (const [f, q, a] of list) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const g = ac.createGain(); g.gain.value = a; src.connect(b); b.connect(g); g.connect(sum); }
  return sum;
}
function breath(ac, v, freq, q) {
  const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac); s.loop = true;
  const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = freq; b.Q.value = q;
  s.connect(b); s.start(v.start, (v.k * 0.137) % 0.9); s.stop(v.stop);
  return b;
}

/**
 * @typedef {Object} Glide
 * @property {string} id
 * @property {string} name
 * @property {string} hint      a few words shown under the name
 * @property {number} level     balance, so every glide sound sits at the same loudness
 * @property {number[][]} vibrato  [rate in Hz, depth in cents] pairs, shared by all voices
 * @property {(ac: BaseAudioContext, dest: AudioNode, v: any) => void} voice
 */
/** @type {Glide[]} */
export const GLIDES = [
  { id: 'pad', name: 'Warm pad', hint: 'soft and round', level: 1, vibrato: [],
    voice(ac, dest, v) { const f = lowpass(ac, v.bass ? 1400 : 2200); mix(ac, [[osc(ac, v, 'triangle'), 1], [osc(ac, v, 'sine', 1, 7), 1]]).connect(f); out(ac, v, f, dest, 1); } },
  { id: 'strings', name: 'Strings', hint: 'a bowed section', level: 3.6, vibrato: [[5.2, 6]],
    voice(ac, dest, v) { const f = lowpass(ac, v.bass ? 1100 : 3000); mix(ac, [[osc(ac, v, 'sawtooth', 1, -10), 0.34], [osc(ac, v, 'sawtooth'), 0.34], [osc(ac, v, 'sawtooth', 1, 9), 0.34]]).connect(f); out(ac, v, f, dest, 0.6); } },
  { id: 'cello', name: 'Solo strings', hint: 'close and woody', level: 2.0, vibrato: [[5.6, 10]],
    voice(ac, dest, v) {
      const body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = v.bass ? 220 : 420; body.Q.value = 1.2; body.gain.value = 7;
      const f = lowpass(ac, v.bass ? 1300 : 2100); mix(ac, [[osc(ac, v, 'sawtooth'), 0.6], [osc(ac, v, 'sawtooth', 1, 5), 0.4]]).connect(body); body.connect(f); out(ac, v, f, dest, 0.55);
    } },
  { id: 'ooh', name: 'Choir “ooh”', hint: 'closed, gentle voices', level: 2.2, vibrato: [[5, 9]],
    voice(ac, dest, v) { const src = mix(ac, [[osc(ac, v, 'sawtooth', 1, -8), 0.5], [osc(ac, v, 'sawtooth', 1, 7), 0.5]]); out(ac, v, formants(ac, src, [[400, 4, 1], [800, 5, 0.4], [2700, 6, 0.07]]), dest, 1.6); } },
  { id: 'aah', name: 'Choir “aah”', hint: 'open, brighter voices', level: 3.5, vibrato: [[5.2, 10]],
    voice(ac, dest, v) { const src = mix(ac, [[osc(ac, v, 'sawtooth', 1, -8), 0.5], [osc(ac, v, 'sawtooth', 1, 7), 0.5]]); out(ac, v, formants(ac, src, [[750, 4, 1], [1150, 5, 0.6], [2800, 6, 0.15]]), dest, 1.4); } },
  { id: 'whistle', name: 'Whistle', hint: 'pure, like a theremin', level: 1, vibrato: [[5.5, 14]],
    voice(ac, dest, v) { out(ac, v, mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.04]]), dest, 1); } },
  { id: 'flute', name: 'Flutes', hint: 'airy and breathy', level: 1, vibrato: [[4.8, 8]],
    voice(ac, dest, v) { const f = lowpass(ac, 4000); mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.2], [osc(ac, v, 'sine', 3), 0.06], [breath(ac, v, 2600, 1.2), v.bass ? 0.02 : 0.06]]).connect(f); out(ac, v, f, dest, 0.95); } },
  { id: 'organ', name: 'Soft organ', hint: 'steady and warm', level: 1.5, vibrato: [],
    voice(ac, dest, v) { out(ac, v, mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.5], [osc(ac, v, 'sine', 3), 0.28], [osc(ac, v, 'sine', 4), 0.14], [osc(ac, v, 'sine', 1, 5), 0.5]]), dest, 0.5); } },
  { id: 'glass', name: 'Glass', hint: 'clear and shimmering', level: 1, vibrato: [[0.3, 3]],
    voice(ac, dest, v) {
      const g = out(ac, v, mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.1], [osc(ac, v, 'sine', 3.01), 0.03]]), ac.createGain(), 1);
      const trem = ac.createGain(); trem.gain.value = 0.9; const l = ac.createOscillator(); l.frequency.value = 2.6 + v.k * 0.23; const d = ac.createGain(); d.gain.value = 0.1;
      l.connect(d); d.connect(trem.gain); l.start(v.start); l.stop(v.stop); g.disconnect(); g.connect(trem); trem.connect(dest);
    } },
  { id: 'lead', name: 'Analog lead', hint: 'a singing synth', level: 2.9, vibrato: [[5.8, 8]],
    voice(ac, dest, v) { const f = lowpass(ac, v.bass ? 900 : 1700, 3.5); osc(ac, v, 'sawtooth').connect(f); out(ac, v, f, dest, 0.42); } },
  { id: 'tape', name: 'Old tape', hint: 'dark and wobbly', level: 1, vibrato: [[0.5, 11], [6.2, 2.5]],
    voice(ac, dest, v) { const f = lowpass(ac, 1300); mix(ac, [[osc(ac, v, 'triangle'), 1], [osc(ac, v, 'square'), 0.07]]).connect(f); out(ac, v, f, dest, 1.15); } },
  { id: 'brass', name: 'Soft brass', hint: 'swells on every move', level: 2.95, vibrato: [[5, 5]],
    voice(ac, dest, v) {
      const f = lowpass(ac, 700, 1); f.frequency.setValueAtTime(700, v.start);
      // the filter opens each time this voice lands on a new note, then settles
      for (const t of v.moves) { f.frequency.setTargetAtTime(v.bass ? 1500 : 2600, t, 0.05); f.frequency.setTargetAtTime(v.bass ? 800 : 1200, t + 0.2, 0.5); }
      mix(ac, [[osc(ac, v, 'sawtooth'), 0.5], [osc(ac, v, 'sawtooth', 1, 6), 0.5]]).connect(f); out(ac, v, f, dest, 0.6);
    } },
];
/** @type {Record<string, Glide>} */
export const GLIDE = Object.fromEntries(GLIDES.map(g => [g.id, g]));
