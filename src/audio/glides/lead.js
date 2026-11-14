// Glide sound: lead. See common.js for the voice interface.
import { osc, lowpass, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'lead', name: 'Analog lead', hint: 'a singing synth', level: 2.9, vibrato: [[5.8, 8]],
  voice(ac, dest, v) { const f = lowpass(ac, v.bass ? 900 : 1700, 3.5); osc(ac, v, 'sawtooth').connect(f); out(ac, v, f, dest, 0.42); } };
