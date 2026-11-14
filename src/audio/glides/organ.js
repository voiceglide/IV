// Glide sound: organ. See common.js for the voice interface.
import { osc, mix, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'organ', name: 'Soft organ', hint: 'steady and warm', level: 1.5, vibrato: [],
  voice(ac, dest, v) { out(ac, v, mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.5], [osc(ac, v, 'sine', 3), 0.28], [osc(ac, v, 'sine', 4), 0.14], [osc(ac, v, 'sine', 1, 5), 0.5]]), dest, 0.5); } };
