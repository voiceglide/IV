// Glide sound: glass. See common.js for the voice interface.
import { osc, mix, out } from './common.js';

/** @type {import('./common.js').Glide} */
export default { id: 'glass', name: 'Glass', hint: 'clear and shimmering', level: 1, vibrato: [[0.3, 3]],
  voice(ac, dest, v) {
    const g = out(ac, v, mix(ac, [[osc(ac, v, 'sine'), 1], [osc(ac, v, 'sine', 2), 0.1], [osc(ac, v, 'sine', 3.01), 0.03]]), ac.createGain(), 1);
    const trem = ac.createGain(); trem.gain.value = 0.9; const l = ac.createOscillator(); l.frequency.value = 2.6 + v.k * 0.23; const d = ac.createGain(); d.gain.value = 0.1;
    l.connect(d); d.connect(trem.gain); l.start(v.start); l.stop(v.stop); g.disconnect(); g.connect(trem); trem.connect(dest);
  } };
