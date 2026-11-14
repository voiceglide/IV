// Glide sound: aah. See common.js for the voice interface.
import { osc, mix, out, formants } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'aah', name: 'Choir “aah”', hint: 'open, brighter voices', level: 3.5, vibrato: [[5.2, 10]],
  voice(ac, dest, v) { const src = mix(ac, [[osc(ac, v, 'sawtooth', 1, -8), 0.5], [osc(ac, v, 'sawtooth', 1, 7), 0.5]]); out(ac, v, formants(ac, src, [[750, 4, 1], [1150, 5, 0.6], [2800, 6, 0.15]]), dest, 1.4); } };
