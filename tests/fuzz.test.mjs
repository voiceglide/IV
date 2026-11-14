// Seeded fuzzing of the pure core: no randomness from the clock, so a failure always reproduces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordsFromText, chordsToText, normalizeProject, newProject, ProjectError } from '../src/core/project.js';
import { buildSong } from '../src/core/song.js';
import { songToMidi } from '../src/core/midiexport.js';
import { parseProgression } from '../src/core/theory.js';
import { parseMidi } from './midi-parse.mjs';

/** mulberry32 */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const QUALS = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'aug', 'add9', '9', 'm7b5', '6', '5', '13'];

function randomText(r) {
  const parts = [], n = 1 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.12) parts.push('[' + pick(r, ['Verse', 'Chorus (soft)x2', 'A', 'Bridge 2']) + ']');
    else if (k < 0.2) parts.push('"la la"');
    else if (k < 0.3) parts.push('(' + chord(r) + ' ' + chord(r) + ')x' + (1 + Math.floor(r() * 3)));
    else parts.push(chord(r) + (r() < 0.25 ? ':' + pick(r, ['1', '2', '0.5', '1.5', '3']) : ''));
  }
  return parts.join(r() < 0.3 ? '\n' : ' ');
}
function chord(r) { return pick(r, ROOTS) + pick(r, QUALS) + (r() < 0.15 ? '/' + pick(r, ROOTS) : ''); }

const JUNK = [null, undefined, NaN, Infinity, -1, 0, 1.5, 1e308, 5e-324, '', 'x', '__proto__', 'constructor', [], {}, true, 'C G', '[', ']', '(((C)x64)x64)x64'];
function junk(r, depth = 0) {
  const k = r();
  if (k < 0.45 || depth > 3) return pick(r, JUNK);
  if (k < 0.6) return Array.from({ length: Math.floor(r() * 4) }, () => junk(r, depth + 1));
  const o = {};
  for (const key of ['version', 'format', 'id', 'name', 'tempo', 'key', 'glide', 'chords', 'tracks', 'text', 'sym', 'beats', 'section', 'voices', 'bass', 'drums', 'melody', 'notes', 'pattern', 'prog', 'sound', 'volume', 't', 'd', 'm', 'split', 'glideStyle'])
    if (r() < 0.3) o[key] = junk(r, depth + 1);
  return o;
}

test('fuzz: chord text survives text -> items -> text -> items', () => {
  const r = rng(1);
  for (let i = 0; i < 400; i++) {
    const t = randomText(r), a = chordsFromText(t);
    assert.equal(a.bad.length, 0, t);
    const b = chordsFromText(chordsToText(a.chords));
    assert.deepEqual(b.chords.map(c => [c.sym, c.beats, c.section]), a.chords.map(c => [c.sym, c.beats, c.section]), t);
  }
});

test('fuzz: the parser is total on arbitrary text and never exceeds the chord cap', () => {
  const r = rng(2), alphabet = 'CDEFGABm7#b/()[]":|,.x 0123456789\n×*°ø';
  for (let i = 0; i < 1500; i++) {
    const t = Array.from({ length: Math.floor(r() * 60) }, () => alphabet[Math.floor(r() * alphabet.length)]).join('');
    const p = parseProgression(t);
    assert.ok(p.chords.length <= 512);
  }
});

test('fuzz: normalizeProject is idempotent and throws only ProjectError', () => {
  const r = rng(3);
  let ok = 0;
  for (let i = 0; i < 1500; i++) {
    const raw = junk(r);
    let n;
    try { n = normalizeProject(raw); } catch (e) { assert.ok(e instanceof ProjectError, String(e && e.stack)); continue; }
    ok++;
    assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(n))), n);
  }
  // mutate a good project too, so the accepted path is well covered
  for (let i = 0; i < 500; i++) {
    const p = JSON.parse(JSON.stringify(newProject('F', randomText(r))));
    const keys = ['tempo', 'glide', 'key', 'name', 'beatsPerChord', 'tracks', 'text', 'chords', 'glideStyle'];
    p[pick(r, keys)] = junk(r);
    if (r() < 0.5) p.tracks = { voices: junk(r), bass: junk(r), drums: junk(r), melody: { notes: [junk(r), junk(r)] } };
    const n = normalizeProject(p);
    assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(n))), n);
    const { song, error } = buildSong(n);
    assert.ok(song || typeof error === 'string');
  }
  assert.ok(ok > 0);
});

test('fuzz: buildSong is total on normalised projects and the MIDI file parses back', () => {
  const r = rng(4);
  for (let i = 0; i < 40; i++) {
    const p = newProject('F', randomText(r));
    p.tempo = 20 + Math.floor(r() * 281);
    p.tracks.bass.pattern = pick(r, ['off', 'root', 'pulse', 'fifth', 'octave']);
    p.tracks.drums.pattern = pick(r, ['off', 'soft', 'basic', 'four', 'half']);
    p.tracks.chords.instrument = pick(r, ['none', 'softpiano', 'arp', 'crystal', 'strumharp', 'lofikeys']);
    p.tracks.melody.notes = Array.from({ length: Math.floor(r() * 6) }, () => ({ t: r() * 16, d: 0.1 + r() * 3, m: 50 + Math.floor(r() * 30) }));
    for (const id of ['voices', 'chords', 'bass', 'drums', 'melody']) if (r() < 0.15) p.tracks[id].solo = true;
    const n = normalizeProject(JSON.parse(JSON.stringify(p)));
    const { song, error } = buildSong(n);
    if (!song) { assert.ok(error); continue; }
    const m = parseMidi(songToMidi(song));
    const end = Math.round(song.cycle / song.spb * 480);
    for (const t of m.tracks) { assert.equal(t.ended, end); for (const x of t.notes) assert.ok(x.off > x.on && x.off <= end + 1); }
  }
});
