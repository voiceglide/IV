// Toy piano: little hammers on metal rods. Bright, a touch out of tune, charmingly thin.
import { additive } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'toypiano', name: 'Toy piano', role: 'chords', style: 'block', highpass: 200, level: 1.5, maxVoices: 12,
  note(ac, out, n) {
    const off = 1 + ((Math.round(n.midi) * 7) % 5 - 2) * 0.0012; // each rod is a few cents off, always the same way
    additive(ac, out, { ...n, freq: n.freq * 2 * off }, { partials: [[1, 1, 0], [2.76, 0.4, 0.25], [5.4, 0.25, 0.09], [0.5, 0.2, 0.6]], peak: 0.05, attack: 0.002, decay: 0.5, sustain: 0, release: 0.25, hold: 2.2, lowpass: 7500 });
  },
};
