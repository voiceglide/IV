// Glide sound: tape. See common.js for the voice interface.
import { osc, mix, lowpass, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'tape', name: 'Old tape', hint: 'dark and wobbly', level: 1, vibrato: [[0.5, 11], [6.2, 2.5]],
  voice(ac, dest, v) { const f = lowpass(ac, 1300); mix(ac, [[osc(ac, v, 'triangle'), 1], [osc(ac, v, 'square'), 0.07]]).connect(f); out(ac, v, f, dest, 1.15); } };
