// Lo-fi keys: a mellow electric tine through a worn tape. Dark, soft bark on the attack, slow wobble.
import { fm, wow } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'lofikeys', name: 'Lo-fi keys', role: 'chords', style: 'tied', highpass: 90, level: 0.7, maxVoices: 12,
  setup(ac, out, span) { return wow(ac, span, [[0.4, 9], [5.5, 2.5]]); },
  note(ac, out, n, drift) { fm(ac, out, n, { ratio: 1, index: 1.1, indexDecay: 0.25, peak: 0.085, attack: 0.006, decay: 1.4, sustain: 0.25, release: 0.5, lowpass: 2600, drift }); },
};
