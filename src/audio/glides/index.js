// All glide sounds, in the order they are offered.
import pad from './pad.js';
import strings from './strings.js';
import cello from './cello.js';
import ooh from './ooh.js';
import aah from './aah.js';
import whistle from './whistle.js';
import flute from './flute.js';
import organ from './organ.js';
import glass from './glass.js';
import lead from './lead.js';
import tape from './tape.js';
import brass from './brass.js';

/** @type {import('./common.js').Glide[]} */
export const GLIDES = [pad, strings, cello, ooh, aah, whistle, flute, organ, glass, lead, tape, brass];
/** @type {Record<string, import('./common.js').Glide>} */
export const GLIDE = Object.fromEntries(GLIDES.map(g => [g.id, g]));
