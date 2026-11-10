// The instrument registry. To add an instrument: write one file that follows audio/instrument.js, import it here.
import softpiano from './softpiano.js';
import lofikeys from './lofikeys.js';
import celesta from './celesta.js';
import toypiano from './toypiano.js';
import vibraphone from './vibraphone.js';
import arp from './arp.js';
import kalimba from './kalimba.js';
import marimba from './marimba.js';
import chiparp from './chiparp.js';
import crystal from './crystal.js';
import musicbox from './musicbox.js';
import strumharp from './strumharp.js';
import lullaby from './lullaby.js';
import dreambells from './dreambells.js';
import stringmachine from './stringmachine.js';
import choir from './choir.js';
import tapeflute from './tapeflute.js';
import glass from './glass.js';
import shimmer from './shimmer.js';
import bass from './softbass.js';

/** In the order the app lists them: keys, plucked, bells, then sustained sounds. @type {import('../instrument.js').Instrument[]} */
const ALL = [softpiano, lofikeys, celesta, toypiano, vibraphone, arp, kalimba, marimba, chiparp, crystal, musicbox, strumharp, lullaby, dreambells,
  stringmachine, choir, tapeflute, glass, shimmer, bass];

/** @type {Record<string, import('../instrument.js').Instrument>} */
export const INSTRUMENTS = Object.fromEntries(ALL.map(i => [i.id, i]));
export const CHORD_INSTRUMENTS = ALL.filter(i => i.role === 'chords');
export const BASS_INSTRUMENTS = ALL.filter(i => i.role === 'bass');
