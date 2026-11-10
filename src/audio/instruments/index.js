// The instrument registry. To add an instrument: write one file that follows audio/instrument.js, import it here.
import softpiano from './softpiano.js';
import arp from './arp.js';
import crystal from './crystal.js';
import strumharp from './strumharp.js';

/** @type {import('../instrument.js').Instrument[]} */
const ALL = [softpiano, arp, crystal, strumharp];

/** @type {Record<string, import('../instrument.js').Instrument>} */
export const INSTRUMENTS = Object.fromEntries(ALL.map(i => [i.id, i]));
export const CHORD_INSTRUMENTS = ALL.filter(i => i.role === 'chords');
export const BASS_INSTRUMENTS = ALL.filter(i => i.role === 'bass');
