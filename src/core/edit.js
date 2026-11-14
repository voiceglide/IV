// Edits on the chord track. Each one changes a project draft in place (see ui/store.js) and is pure otherwise.
import { parseChord } from './theory.js';
import { newId } from './project.js';

/** Insert a chord after position `at` (−1 puts it first). Returns the new chord's index. */
export function insertChord(p, at, sym = 'C') {
  const i = Math.max(0, Math.min(p.chords.length, at + 1));
  p.chords.splice(i, 0, { id: newId().slice(0, 8), sym, beats: null, section: '' });
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

/** Move the chord at `from` so it ends up at index `to`. Section labels stay where they are on the timeline. Returns `to`. */
export function moveChordTo(p, from, to) {
  to = Math.max(0, Math.min(p.chords.length - 1, to));
  if (from === to || from < 0 || from >= p.chords.length) return from;
  const sections = p.chords.map(c => c.section);
  const [c] = p.chords.splice(from, 1); p.chords.splice(to, 0, c);
  p.chords.forEach((x, k) => { x.section = sections[k]; });
  return to;
}

/** Shift every chord (and its bass note) by `semitones`, and the key with it. */
export function transposeChords(p, semitones) {
  const wrap = n => ((n % 12) + 12) % 12;
  for (const c of p.chords) {
    if (!parseChord(c.sym)) continue;
    const q = chordParts(c.sym);
    c.sym = chordSym(wrap(q.root + semitones), q.q, q.bass >= 0 ? wrap(q.bass + semitones) : -1);
  }
  if (/^\d+(:m)?$/.test(p.key)) p.key = wrap(parseInt(p.key, 10) + semitones) + (p.key.endsWith(':m') ? ':m' : '');
}

const ACC = { '♯': '#', '♭': 'b', '': '' };
/** The parts of a chord symbol, for the picker: root pitch class, quality id, bass pitch class (or −1). */
export function chordParts(sym) {
  const c = parseChord(sym);
  if (!c) return { root: 0, q: '', bass: -1, rootName: 'C', bassName: '' };
  return { root: c.root, q: c.q, bass: c.slash ? c.bass : -1, rootName: c.letter + ACC[c.acc], bassName: c.slash ? String(c.slash).replace('♯', '#').replace('♭', 'b') : '' };
}
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Build a chord symbol from picker choices. `rootName` keeps a spelling the person typed (C# stays C#). */
export function chordSym(root, q, bass = -1, rootName = '', bassName = '') {
  const keepBass = bassName && parseChord(bassName) && /** @type {any} */(parseChord(bassName)).root === bass;
  const keep = rootName && parseChord(rootName) && /** @type {any} */(parseChord(rootName)).root === root;
  return (keep ? rootName : NAMES[root]) + q + (bass >= 0 && bass !== root ? '/' + (keepBass ? bassName : NAMES[bass]) : '');
}

/** Tempo in beats per minute from the times (ms) of a series of taps, or null when there are fewer than two. Uses the last five taps. */
export function tempoFromTaps(times) {
  const t = times.slice(-5); if (t.length < 2) return null;
  const bpm = 60000 / ((t[t.length - 1] - t[0]) / (t.length - 1));
  return Math.max(20, Math.min(300, Math.round(bpm * 10) / 10));
}
