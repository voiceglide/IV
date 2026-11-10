// Vibraphone: a struck metal bar that rings long, with the slow tremolo of its motor.
import { fm } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'vibraphone', name: 'Vibraphone', role: 'chords', style: 'tied', highpass: 110, level: 1, maxVoices: 10,
  // the motor: every note passes through one shared, slowly pulsing gain
  setup(ac, out, span) {
    const trem = ac.createGain(); trem.gain.value = 0.82; trem.connect(out);
    const lfo = ac.createOscillator(); lfo.frequency.value = 4.6; const d = ac.createGain(); d.gain.value = 0.18;
    lfo.connect(d); d.connect(trem.gain); lfo.start(span.start); lfo.stop(span.end);
    return trem;
  },
  note(ac, out, n, trem) { fm(ac, trem || out, n, { ratio: 4, index: 0.9, indexDecay: 0.09, peak: 0.075, attack: 0.003, decay: 1.6, sustain: 0.08, release: 0.5, lowpass: 7000 }); },
};
