// Soft marimba: yarn mallets on wood. Warm, short, with a hollow fourth harmonic.
import { additive, breath } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'marimba', name: 'Soft marimba', role: 'chords', style: 'arp', highpass: 80, level: 1.65, maxVoices: 8,
  note(ac, out, n) {
    const tau = Math.max(0.12, Math.min(0.5, 0.3 * Math.pow(330 / n.freq, 0.5)));
    additive(ac, out, n, { partials: [[1, 1, 0], [4, 0.28, tau * 0.3], [9.2, 0.07, 0.03]], peak: 0.1, attack: 0.003, decay: tau, sustain: 0, release: 0.2, hold: tau * 5, lowpass: 5000 });
    breath(ac, out, n, { freq: 900, q: 0.8, peak: 0.018, decay: 0.01, sustain: 0, hold: 0.06 });
  },
};
