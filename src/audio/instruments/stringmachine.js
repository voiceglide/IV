// String machine: the warm, chorused strings of a seventies ensemble keyboard.
import { ensemble, wow } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'stringmachine', name: 'Warm strings', role: 'chords', style: 'tied', highpass: 120, level: 1.8, maxVoices: 10,
  setup(ac, out, span) { return wow(ac, span, [[0.63, 6], [0.97, 5], [5.9, 3]]); },
  note(ac, out, n, drift) { ensemble(ac, out, n, { type: 'sawtooth', detune: [-11, -3, 4, 10], peak: 0.07, attack: 0.18, release: 0.8, lowpass: Math.min(4200, n.freq * 7), open: 1, drift }); },
};
