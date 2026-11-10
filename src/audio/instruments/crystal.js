// Soft glassy bell: a sine with a few quiet partials, instant attack, long gentle decay. Plays an octave up.
import { envelope } from '../instrument.js';

const PARTIALS = [[1, 1, 0], [2, 0.2, 0.4], [3.01, 0.06, 0.25], [4.17, 0.03, 0.08]];

/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'crystal', name: 'Crystal bells', role: 'chords', style: 'arpHigh', highpass: 200, level: 2, maxVoices: 10,
  note(ac, out, n) {
    const g = ac.createGain();
    const stop = Math.min(n.time + 4.5, envelope(g, { time: n.time, duration: 3, peak: 0.034 * n.velocity, attack: 0.005, decay: 0.75, sustain: 0, release: 0.4 }));
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 6500; fl.connect(g); g.connect(out);
    for (const [r, a, tau] of PARTIALS) {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = n.freq * r;
      const pg = ac.createGain(); pg.gain.setValueAtTime(a, n.time); if (tau) pg.gain.setTargetAtTime(0, n.time, tau);
      o.connect(pg); pg.connect(fl); o.start(n.time); o.stop(stop);
    }
  },
};
