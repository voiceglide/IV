// Glide sound: ooh. See common.js for the voice interface.
import { osc, mix, out, formants } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'ooh', name: 'Choir “ooh”', hint: 'closed, gentle voices', level: 2.2, vibrato: [[5, 9]],
  voice(ac, dest, v) { const src = mix(ac, [[osc(ac, v, 'sawtooth', 1, -8), 0.5], [osc(ac, v, 'sawtooth', 1, 7), 0.5]]); out(ac, v, formants(ac, src, [[400, 4, 1], [800, 5, 0.4], [2700, 6, 0.07]]), dest, 1.6); } };
