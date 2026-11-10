// Picked arpeggio: the soft piano voice, one chord tone per beat, up and down.
import soft from './softpiano.js';

/** @type {import('../instrument.js').Instrument} */
export default {
  id: 'arp', name: 'Picked arpeggio', role: 'chords', style: 'arp', highpass: 70, level: 1, maxVoices: 8,
  note: soft.note,
};
