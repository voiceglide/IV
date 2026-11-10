// Celesta: felt hammers on small metal plates. Clear and sweet, between a bell and a piano.
import { additive } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'celesta', name: 'Celesta', role: 'chords', style: 'block', highpass: 180, level: 1, maxVoices: 12,
  note(ac, out, n) { additive(ac, out, n, { partials: [[2, 1, 0], [1, 0.45, 0], [4, 0.3, 0.35], [8.02, 0.1, 0.1], [3, 0.06, 0.5]], peak: 0.05, attack: 0.003, decay: 0.8, sustain: 0.05, release: 0.35, lowpass: 8000 }); },
};
