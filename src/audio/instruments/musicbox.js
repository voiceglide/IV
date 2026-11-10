// Music box: a small steel comb. Bright pluck, slightly sharp overtones, quick fade. Plays an octave up, one note per beat.
import { additive } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'musicbox', name: 'Music box', role: 'chords', style: 'arpHigh', highpass: 250, level: 1.75, maxVoices: 10,
  note(ac, out, n) { additive(ac, out, n, { partials: [[1, 1, 0], [2.01, 0.35, 0.5], [4.07, 0.22, 0.18], [6.3, 0.1, 0.07]], peak: 0.06, attack: 0.002, decay: 0.55, sustain: 0, release: 0.3, hold: 2.5, lowpass: 9000 }); },
};
