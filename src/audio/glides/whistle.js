// Glide sound: whistle. See common.js for the voice interface.
import { osc, mix, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'whistle', name: 'Whistle', hint: 'pure, like a theremin', level: 1, vibrato: [[5.5, 14]],
  voice(ac, dest, v) { out(ac, v, mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.04]]), dest, 1); } };
