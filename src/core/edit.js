// Edits on the chord track. Each one changes a project draft in place (see ui/store.js) and is pure otherwise.
import { parseChord } from './theory.js';
import { newId } from './project.js';

/** Insert a chord after position `at` (−1 puts it first). Returns the new chord's index. */
export function insertChord(p, at, sym = 'C') {
  const i = Math.max(0, Math.min(p.chords.length, at + 1));
  p.chords.splice(i, 0, { sym, beats: null, section: '' });
  return i;
}
export function removeChord(p, i) {
  const [gone] = p.chords.splice(i, 1);
  // a section label moves on to the next chord instead of vanishing with its first one
  if (gone && gone.section && p.chords[i] && !p.chords[i].section) p.chords[i].section = gone.section;
}
export function duplicateChord(p, i) { const c = p.chords[i]; p.chords.splice(i + 1, 0, { id: newId().slice(0, 8), sym: c.sym, beats: c.beats, section: '' }); return i + 1; }
/** Swap with the neighbour on the left (dir −1) or right (dir 1). Returns the chord's new index. */
export function moveChord(p, i, dir) {
  const j = i + dir; if (j < 0 || j >= p.chords.length) return i;
  const a = p.chords[i], b = p.chords[j], sa = a.section, sb = b.section;
  p.chords[i] = b; p.chords[j] = a;
  // section labels stay where they are on the timeline
  p.chords[i].section = sa; p.chords[j].section = sb;
  return j;
}

const ACC = { '♯': '#', '♭': 'b', '': '' };
/** The parts of a chord symbol, for the picker: root pitch class, quality id, bass pitch class (or −1). */
export function chordParts(sym) {
  const c = parseChord(sym);
  if (!c) return { root: 0, q: '', bass: -1, rootName: 'C' };
  return { root: c.root, q: c.q, bass: c.slash ? c.bass : -1, rootName: c.letter + ACC[c.acc] };
}
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Build a chord symbol from picker choices. `rootName` keeps a spelling the person typed (C# stays C#). */
export function chordSym(root, q, bass = -1, rootName = '') {
  const keep = rootName && parseChord(rootName) && /** @type {any} */(parseChord(rootName)).root === root;
  return (keep ? rootName : NAMES[root]) + q + (bass >= 0 && bass !== root ? '/' + NAMES[bass] : '');
}
