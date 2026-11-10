// Strummed electronic harp: each chord is swept upward across about two octaves, soft plucked tones
// (sine plus quiet overtones) with a natural decay and a slow tape wow on everything.
import { envelope } from '../instrument.js';

/** @type {[number, number, OscillatorType][]} */
const PARTIALS = [[1, 1, 'sine'], [2, 0.22, 'sine'], [1, 0.12, 'triangle'], [3, 0.05, 'sine']];

/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'strumharp', name: 'Strummed harp', role: 'chords', style: 'sweep', highpass: 110, level: 1.4, maxVoices: 20,
  // tape wow (0.55 Hz, about 5 cents) plus a little flutter (6 Hz, about 1.5 cents), shared by every note
  setup(ac, out, span) {
    const wow = ac.createGain(); wow.gain.value = 1;
    for (const [f, cents] of [[0.55, 5], [6, 1.5]]) {
      const o = ac.createOscillator(); o.frequency.value = f; const g = ac.createGain(); g.gain.value = cents;
      o.connect(g); g.connect(wow); o.start(span.start); o.stop(span.end);
    }
    return wow;
  },
  note(ac, out, n, wow) {
    const tau = Math.max(0.35, Math.min(1.1, 0.9 * Math.pow(440 / n.freq, 0.45)));
    const g = ac.createGain();
    const stop = envelope(g, { time: n.time, duration: tau * 5, peak: 0.024 * n.velocity, attack: 0.004, decay: tau, sustain: 0, release: 0.3 });
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = Math.min(5200, n.freq * 7); fl.Q.value = 0.4;
    fl.connect(g); g.connect(out);
    for (const [r, a, type] of PARTIALS) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = n.freq * r; if (wow) wow.connect(o.detune);
      const pg = ac.createGain(); pg.gain.value = a; o.connect(pg); pg.connect(fl); o.start(n.time); o.stop(stop);
    }
  },
};
