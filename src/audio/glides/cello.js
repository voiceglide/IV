// Glide sound: cello. See common.js for the voice interface.
import { osc, mix, lowpass, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'cello', name: 'Solo strings', hint: 'close and woody', level: 2.0, vibrato: [[5.6, 10]],
  voice(ac, dest, v) {
    const body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = v.bass ? 220 : 420; body.Q.value = 1.2; body.gain.value = 7;
    const f = lowpass(ac, v.bass ? 1300 : 2100); mix(ac, [[osc(ac, v, 'sawtooth'), 0.6], [osc(ac, v, 'sawtooth', 1, 5), 0.4]]).connect(body); body.connect(f); out(ac, v, f, dest, 0.55);
  } };
