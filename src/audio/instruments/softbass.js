// The bass track's own voice: a round, soft bass with a little definition on the attack.
import { additive } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'bass', name: 'Soft bass', role: 'bass', style: 'block', highpass: 35, level: 0.3, maxVoices: 2,
  note(ac, out, n) { additive(ac, out, n, { partials: [[1, 1, 0], [2, 0.5, 0.5], [3, 0.25, 0.25], [4, 0.1, 0.12], [1, 0.25, 0, 'triangle']], peak: 0.2, attack: 0.008, decay: 1.2, sustain: 0.45, release: 0.12, lowpass: Math.min(1400, n.freq * 10) }); },
};
