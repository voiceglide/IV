// Tape choir: a soft "ooh" from an old tape keyboard. Detuned voices through two vowel filters, slow wobble.
import { ensemble, wow } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'choir', name: 'Tape choir', role: 'chords', style: 'tied', highpass: 130, level: 1, maxVoices: 10,
  setup(ac, out, span) {
    // the vowel: two formants in parallel, shared by all voices
    const sum = ac.createGain(); sum.gain.value = 1;
    for (const [f, q, a] of [[420, 4, 1], [850, 5, 0.45], [2600, 6, 0.08]]) {
      const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const g = ac.createGain(); g.gain.value = a;
      sum.connect(b); b.connect(g); g.connect(out);
    }
    return { sum, drift: wow(ac, span, [[0.5, 7], [5.2, 6]]) };
  },
  note(ac, out, n, s) { ensemble(ac, s ? s.sum : out, n, { type: 'sawtooth', detune: [-9, 0, 8], peak: 0.2, attack: 0.1, release: 0.7, lowpass: 3200, drift: s && s.drift }); },
};
