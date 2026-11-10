// Tape flute: a breathy, slightly wavering flute, as from an old tape keyboard.
import { additive, breath, wow } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'tapeflute', name: 'Tape flute', role: 'chords', style: 'tied', highpass: 160, level: 0.55, maxVoices: 8,
  setup(ac, out, span) { return wow(ac, span, [[0.45, 8], [5, 5]]); },
  note(ac, out, n, drift) {
    const up = { ...n, freq: n.freq * 2 };
    additive(ac, out, up, { partials: [[1, 1, 0], [2, 0.18, 0], [3, 0.07, 0], [1, 0.1, 0, 'triangle']], peak: 0.06, attack: 0.07, release: 0.35, lowpass: 3800, drift });
    breath(ac, out, up, { freq: Math.min(6000, up.freq * 2), q: 1.5, peak: 0.012, attack: 0.03, release: 0.25 });
  },
};
