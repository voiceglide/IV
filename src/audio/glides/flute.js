// Glide sound: flute. See common.js for the voice interface.
import { osc, mix, lowpass, out, breath } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'flute', name: 'Flutes', hint: 'airy and breathy', level: 1, vibrato: [[4.8, 8]],
  voice(ac, dest, v) { const f = lowpass(ac, 4000); mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.2], [osc(ac, v, 'sine', 3), 0.06], [breath(ac, v, 2600, 1.2), v.bass ? 0.02 : 0.06]]).connect(f); out(ac, v, f, dest, 0.95); } };
