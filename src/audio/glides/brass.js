// Glide sound: brass. See common.js for the voice interface.
import { osc, mix, lowpass, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'brass', name: 'Soft brass', hint: 'swells on every move', level: 2.95, vibrato: [[5, 5]],
  voice(ac, dest, v) {
    const f = lowpass(ac, 700, 1); f.frequency.setValueAtTime(700, v.start);
    // the filter opens each time this voice lands on a new note, then settles
    for (const t of v.moves) { f.frequency.setTargetAtTime(v.bass ? 1500 : 2600, t, 0.05); f.frequency.setTargetAtTime(v.bass ? 800 : 1200, t + 0.2, 0.5); }
    mix(ac, [[osc(ac, v, 'sawtooth'), 0.5], [osc(ac, v, 'sawtooth', 1, 6), 0.5]]).connect(f); out(ac, v, f, dest, 0.6);
  } };
