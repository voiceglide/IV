// Kalimba: thumb piano. A round plucked tine with a soft knock and one high, short overtone.
import { additive, breath } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'kalimba', name: 'Kalimba', role: 'chords', style: 'arp', highpass: 120, level: 1.75, maxVoices: 8,
  note(ac, out, n) {
    additive(ac, out, n, { partials: [[1, 1, 0], [2, 0.12, 0.3], [5.4, 0.3, 0.05], [6.8, 0.12, 0.03]], peak: 0.085, attack: 0.002, decay: 0.45, sustain: 0, release: 0.25, hold: 2, lowpass: 6000 });
    breath(ac, out, n, { freq: 1800, q: 1.2, peak: 0.02, decay: 0.012, sustain: 0, hold: 0.08 });
  },
};
