// Shared building blocks of the glide sounds. A glide sound is one file in this folder that default-exports a Glide:
//   { id, name, hint, level, vibrato, voice(ac, dest, v) }
// voice() builds ONE voice's chain from the engine's description v:
//   v.k        voice number (0 = bass, 1 = top voice, 2…5 the inner voices), v.bass
//   v.start, v.stop           when sources may start and must stop
//   v.base, v.bus             the voice's first note in Hz, and its pitch bus (cents, driven by glideCurve): osc() wires them up
//   v.amp(param, scale)       schedules this voice's loudness (fade in, doubled voices muted, swell on arrival, fade out)
//   v.vib                     a node carrying this voice's vibrato in cents (fades in once the voice has arrived), or null
//   v.moves                   times at which this voice arrives on a new note
//   v.swell                   0…1, how much the sound should open up on each arrival (the engine also swells the loudness)
// A sound only decides the timbre. It never schedules pitch itself.
import { noiseBuffer } from '../instruments/kit.js';

/**
 * @typedef {Object} Glide
 * @property {string} id
 * @property {string} name
 * @property {string} hint      a few words shown under the name
 * @property {number} level     balance, so every glide sound sits at the same loudness
 * @property {number[][]} vibrato  [rate in Hz, depth in cents] pairs, shared by all voices of this sound; [] = none
 * @property {(ac: BaseAudioContext, dest: AudioNode, v: any) => void} voice
 */

export function osc(ac, v, type, ratio = 1, cents = 0) {
  const o = ac.createOscillator(); o.type = type; o.frequency.value = v.base * ratio; o.detune.value = cents;
  v.bus.connect(o.detune);
  if (v.vib) v.vib.connect(o.detune);
  o.start(v.start); o.stop(v.stop);
  return o;
}
export function mix(ac, sources) {
  const sum = ac.createGain(); sum.gain.value = 1;
  for (const [node, gain] of sources) { const g = ac.createGain(); g.gain.value = gain; node.connect(g); g.connect(sum); }
  return sum;
}
export function lowpass(ac, f, q = 0.7) { const b = ac.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; }
export function out(ac, v, node, dest, scale) { const g = ac.createGain(); g.gain.value = 0; v.amp(g.gain, scale); node.connect(g); g.connect(dest); return g; }
/** Vowel: a few band-pass filters in parallel. */
export function formants(ac, src, list) {
  const sum = ac.createGain(); sum.gain.value = 1;
  for (const [f, q, a] of list) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const g = ac.createGain(); g.gain.value = a; src.connect(b); b.connect(g); g.connect(sum); }
  return sum;
}
export function breath(ac, v, freq, q) {
  const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac); s.loop = true;
  const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = freq; b.Q.value = q;
  s.connect(b); s.start(v.start, (v.k * 0.137) % 0.9); s.stop(v.stop);
  return b;
}

