// Glass harmonica: wet fingers on glass rims. A pure tone that swells in slowly and sings.
import { additive, wow } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'glass', name: 'Singing glass', role: 'chords', style: 'tied', highpass: 150, level: 0.8, maxVoices: 10,
  setup(ac, out, span) { return wow(ac, span, [[4.8, 4], [0.3, 3]]); },
  note(ac, out, n, drift) { additive(ac, out, { ...n, freq: n.freq * 2 }, { partials: [[1, 1, 0], [2.02, 0.12, 0], [3.01, 0.05, 0], [0.5, 0.25, 0]], peak: 0.045, attack: 0.28, release: 0.9, lowpass: 5000, drift }); },
};
