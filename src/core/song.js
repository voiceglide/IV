// The timeline: turns a Project into everything the renderer and the audio engine need to know about time.
// The progression is unrolled three times so the loop has no seam: the exported window [vs, ve] is one full
// cycle taken from the middle. Pure functions, no DOM, no audio.
import { parseChord, chooseVoicings, detectKey, romanOf, Q, MINORISH, SHARP, FLAT } from './theory.js';

const clamp = u => Math.max(0, Math.min(1, u));
const easeInOutSine = u => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u));
const LEAD = 0.26; // the loop starts this long before its first chord, inside the glide that leads to it

/**
 * @param {import('./project.js').Project} project
 * @returns {{song: any, error: string}}  song is null when there is nothing to play; error says why, in plain words
 */
export function buildSong(project) {
  const base = [];
  let section = '';
  for (const item of project.chords) {
    const c = parseChord(item.sym);
    if (!c) return { song: null, error: `“${item.sym}” is not a chord this app knows. Try a name like C, Am7 or F/A.` };
    if (item.section) section = item.section;
    base.push(Object.assign(c, { beats: item.beats, section, secStart: !!item.section }));
  }
  const n = base.length;
  if (!n) return { song: null, error: '' };
  const tri = [...base, ...base, ...base].map(c => Object.assign({}, c));
  const vAll = chooseVoicings(tri);
  if (!vAll) return { song: null, error: 'One of these chords could not be placed on the keyboard.' };
  const mid = vAll.slice(n, 2 * n), v = [...mid, ...mid, ...mid];
  const spb = 60 / project.tempo, starts = [];
  let t = 0;
  for (const c of tri) { starts.push(t); t += (c.beats || project.beatsPerChord) * spb; }
  const cycle = t / 3;
  const key = project.key === 'auto' ? detectKey(base) : { root: +project.key.split(':')[0], minor: project.key.endsWith(':m') };
  const scale = [0, 2, 4, 5, 7, 9, 11].map(x => (x + key.root + (key.minor ? 3 : 0)) % 12);
  tri.forEach(c => { c.rn = romanOf(c, key); c.strong = !Q[c.q][0].every(x => scale.includes((c.root + x) % 12)); });
  let uLo = 99, uHi = 0, bLo = 99, bHi = 0;
  for (const x of mid) { uLo = Math.min(uLo, ...x.upper); uHi = Math.max(uHi, ...x.upper); bLo = Math.min(bLo, x.bass); bHi = Math.max(bHi, x.bass); }
  const vs = cycle + starts[0] - LEAD;
  const text = project.text;
  return {
    error: '',
    song: {
      chords: tri, v, starts, end: t, cycle, n, vs, ve: vs + cycle, spb, key, sharps: base.some(c => c.acc === '♯'),
      uLo, uHi, bLo, bHi, dur: Math.max(0.4, Math.min(cycle / n, 8)), kb: null, glide: project.glide,
      hook: text.hook.trim(), question: text.question.trim(), reveal: text.reveal.trim(), watermark: text.watermark.trim(), qSec: 2.2,
      beats: cycle / spb, tempo: project.tempo, tracks: project.tracks,
    },
  };
}

export function glideOf(song, i) { return Math.min(song.glide, 0.6 * (song.starts[i] - song.starts[i - 1])); }
/** Voice k of chord i: 0 is the bass, 1…5 the upper voices from the top down (short chords repeat their lowest voice). */
export function slotPitch(song, i, k) { const v = song.v[i]; if (k === 0) return v.bass; return v.upper[Math.min(k - 1, v.upper.length - 1)]; }
export function idxAt(song, t) {
  const s = song.starts; if (t < s[0]) return 0;
  let a = 0, b = s.length - 1;
  while (a < b) { const m = (a + b + 1) >> 1; if (s[m] <= t) a = m; else b = m - 1; }
  return a;
}
export function glideState(song, t) {
  const s = song.starts, n = s.length; if (t <= s[0]) return { i: 0, e: 0 };
  const i = idxAt(song, t); if (i === n - 1) return { i, e: 0 };
  const g = glideOf(song, i + 1), gs = s[i + 1] - g; if (t < gs) return { i, e: 0 };
  return { i, e: easeInOutSine((t - gs) / g) };
}
export function pitchAt(song, k, t) { const { i, e } = glideState(song, t); const a = slotPitch(song, i, k); if (!e) return a; return a + (slotPitch(song, i + 1, k) - a) * e; }
export function noteAt(song, k, t) { const { i, e } = glideState(song, t); return e < 0.5 ? slotPitch(song, i, k) : slotPitch(song, i + 1, k); }

const SHARP_MAJ = new Set([7, 2, 9, 4, 11, 6, 1]), SHARP_MIN = new Set([4, 11, 6, 1, 8, 3]);
export function useSharps(song, ch) {
  if (ch.acc === '♯') return true; if (ch.acc === '♭') return false;
  if (MINORISH.has(ch.q)) return SHARP_MIN.has(ch.root);
  if (ch.root === 0 || ch.root === 5) return song.sharps;
  return SHARP_MAJ.has(ch.root);
}
export function noteName(song, m, ch) { const sh = ch ? useSharps(song, ch) : song.sharps; return (sh ? SHARP : FLAT)[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
/** The distinct notes of chord i, bass first. */
export function chordNotes(song, i) { const v = song.v[i]; return [v.bass, ...new Set(v.upper)]; }
