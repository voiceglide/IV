// Dream bells: glassy FM bells rolled up the chord, with a long shimmering tail.
import { fm } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'dreambells', name: 'Dream bells', role: 'chords', style: 'roll', highpass: 180, level: 1, maxVoices: 14,
  note(ac, out, n) {
    fm(ac, out, n, { ratio: 3.5, index: 1.6, indexDecay: 0.35, peak: 0.04, attack: 0.004, decay: 1.3, sustain: 0, release: 0.5, hold: 5, lowpass: 9000 });
    fm(ac, out, { ...n, freq: n.freq * 2.003 }, { ratio: 2, index: 0.5, indexDecay: 0.2, peak: 0.012, attack: 0.02, decay: 0.9, sustain: 0, release: 0.4, hold: 4, lowpass: 9000 });
  },
};
