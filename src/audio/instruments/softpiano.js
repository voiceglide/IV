// Soft felt piano: a sine with a quiet octave above, slow decay.
import { envelope } from '../instrument.js';

/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'softpiano', name: 'Soft piano', role: 'chords', style: 'tied', highpass: 70, level: 0.8, maxVoices: 12,
  note(ac, out, n) {
    const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = n.freq;
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = n.freq * 2.001;
    const g2 = ac.createGain(); g2.gain.value = 0.18;
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = Math.min(4500, n.freq * 6);
    const g = ac.createGain();
    const stop = envelope(g, { time: n.time, duration: n.duration, peak: 0.075 * n.velocity, attack: 0.016, decay: 1.3, sustain: 0.22, release: 0.7 });
    o1.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(out);
    o1.start(n.time); o2.start(n.time); o1.stop(stop); o2.stop(stop);
  },
};
