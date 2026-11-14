// A small library of common chord progressions, written as steps of the scale so they work in any key.
// Generic patterns only (no songs). Used by the New project dialog and "Surprise me".
import { chordSym } from './edit.js';

/** @typedef {{id:string, name:string, mood:string, minor:boolean, steps:[number,string][]}} Progression  steps: [semitones above the key note, chord type] */

/** @type {Progression[]} */
export const LIBRARY = [
  { id: 'pop', name: 'Pop four', mood: 'Bright, familiar', minor: false, steps: [[0, ''], [7, ''], [9, 'm'], [5, '']] },
  { id: 'doowop', name: 'Fifties', mood: 'Warm, nostalgic', minor: false, steps: [[0, ''], [9, 'm'], [5, ''], [7, '']] },
  { id: 'sad', name: 'Bittersweet', mood: 'Wistful, rising', minor: false, steps: [[9, 'm'], [5, ''], [0, ''], [7, '']] },
  { id: 'rock', name: 'Classic rock', mood: 'Open, driving', minor: false, steps: [[0, ''], [10, ''], [5, ''], [0, '']] },
  { id: 'hymn', name: 'Hymn', mood: 'Calm, resolved', minor: false, steps: [[0, ''], [5, ''], [0, ''], [7, '']] },
  { id: 'canon', name: 'Canon', mood: 'Flowing, eight chords', minor: false, steps: [[0, ''], [7, ''], [9, 'm'], [4, 'm'], [5, ''], [0, ''], [5, ''], [7, '']] },
  { id: 'jazz', name: 'Jazz turnaround', mood: 'Smooth, 7th chords', minor: false, steps: [[2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']] },
  { id: 'soul', name: 'Neo soul', mood: 'Lush, mellow', minor: false, steps: [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']] },
  { id: 'lofi', name: 'Lo-fi', mood: 'Dusty, relaxed', minor: false, steps: [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, 'm7']] },
  { id: 'epic', name: 'Epic minor', mood: 'Dark, cinematic', minor: true, steps: [[0, 'm'], [8, ''], [3, ''], [10, '']] },
  { id: 'descent', name: 'Falling minor', mood: 'Dramatic, falling', minor: true, steps: [[0, 'm'], [10, ''], [8, ''], [7, '']] },
  { id: 'minorloop', name: 'Minor loop', mood: 'Moody, circling', minor: true, steps: [[0, 'm'], [5, 'm'], [10, ''], [3, '']] },
  { id: 'blues', name: '12-bar blues', mood: 'Gritty, twelve chords', minor: false, steps: [[0, '7'], [0, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [0, '7'], [7, '7'], [5, '7'], [0, '7'], [7, '7']] },
];

export const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** The chord symbols of a progression in the key whose note is `root` (0 = C … 11 = B). */
export function progressionSyms(prog, root = 0) {
  return prog.steps.map(([d, q]) => chordSym((root + d) % 12, q, -1));
}
/** The project key string for a progression in a key: "7" or "9:m". */
export const keyString = (prog, root) => root + (prog.minor ? ':m' : '');

/** A random progression in a random key. `rand` is Math.random unless a test passes its own. @returns {{prog:Progression, root:number, syms:string[]}} */
export function surprise(rand = Math.random) {
  const prog = LIBRARY[Math.floor(rand() * LIBRARY.length)], root = Math.floor(rand() * 12);
  return { prog, root, syms: progressionSyms(prog, root) };
}
