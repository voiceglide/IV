// Soft chip arpeggio: the rounded square wave of an old handheld console, one note per beat.
import { additive } from './kit.js';
/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'chiparp', name: 'Pocket console', role: 'chords', style: 'arp', highpass: 120, level: 2.7, maxVoices: 6,
  note(ac, out, n) { additive(ac, out, n, { partials: [[1, 1, 0, 'square'], [2, 0.12, 0.08, 'square']], peak: 0.035, attack: 0.004, decay: 0.35, sustain: 0.3, release: 0.12, lowpass: Math.min(3200, n.freq * 6) }); },
};
