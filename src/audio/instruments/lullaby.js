// Lullaby pluck: a soft nylon string, rolled gently up the chord.
import { additive } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'lullaby', name: 'Lullaby strings', role: 'chords', style: 'roll', highpass: 90, level: 0.65, maxVoices: 14,
  note(ac, out, n) {
    const tau = Math.max(0.5, Math.min(1.6, 1.1 * Math.pow(330 / n.freq, 0.4)));
    additive(ac, out, n, { partials: [[1, 1, 0], [2, 0.5, tau * 0.5], [3, 0.3, tau * 0.3], [4, 0.16, tau * 0.2], [5, 0.1, tau * 0.12], [6, 0.05, tau * 0.08]], peak: 0.06, attack: 0.003, decay: tau, sustain: 0, release: 0.3, hold: tau * 4, lowpass: Math.min(5000, n.freq * 9) });
  },
};
