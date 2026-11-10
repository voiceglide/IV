// Shimmer pad: a soft held chord with a slow halo an octave above.
import { ensemble, additive, wow } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'shimmer', name: 'Shimmer pad', role: 'chords', style: 'tied', highpass: 140, level: 1, maxVoices: 10,
  setup(ac, out, span) { return wow(ac, span, [[0.21, 6], [0.33, 4]]); },
  note(ac, out, n, drift) {
    ensemble(ac, out, n, { type: 'triangle', detune: [-7, 6], peak: 0.07, attack: 0.5, release: 1.2, lowpass: 2400, drift });
    additive(ac, out, { ...n, freq: n.freq * 2 }, { partials: [[1, 1, 0], [2, 0.3, 0], [3, 0.1, 0]], peak: 0.02, attack: 1.1, release: 1.4, lowpass: 7000, drift });
  },
};
