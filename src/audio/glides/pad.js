// Glide sound: pad. See common.js for the voice interface.
import { osc, mix, lowpass, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'pad', name: 'Warm pad', hint: 'soft and round', level: 1, vibrato: [],
  voice(ac, dest, v) { const f = lowpass(ac, v.bass ? 1400 : 2200); mix(ac, [[osc(ac, v, 'triangle'), 1], [osc(ac, v, 'sine', 1, 7), 1]]).connect(f); out(ac, v, f, dest, 1); } };
