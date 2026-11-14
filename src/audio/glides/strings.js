// Glide sound: strings. See common.js for the voice interface.
import { osc, mix, lowpass, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'strings', name: 'Strings', hint: 'a bowed section', level: 3.6, vibrato: [[5.2, 6]],
  voice(ac, dest, v) { const f = lowpass(ac, v.bass ? 1100 : 3000); mix(ac, [[osc(ac, v, 'sawtooth', 1, -10), 0.34], [osc(ac, v, 'sawtooth'), 0.34], [osc(ac, v, 'sawtooth', 1, 9), 0.34]]).connect(f); out(ac, v, f, dest, 0.6); } };
