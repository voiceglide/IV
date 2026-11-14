// Regressions for problems found by an audit: each test here failed before its fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, parseProgression, expandRepeats, romanOf } from '../src/core/theory.js';
import { newProject, normalizeProject, parseProjectFile, chordsFromText, chordsToText, ProjectError, serializeProject } from '../src/core/project.js';
import { buildSong } from '../src/core/song.js';
import { createHistory } from '../src/core/history.js';
import { encodeMidi } from '../src/core/midi.js';
import { songToMidi } from '../src/core/midiexport.js';
import { parseMidi } from './midi-parse.mjs';

test('prototype keys are not chord qualities, patterns or sounds', () => {
  for (const k of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'])
    assert.equal(parseChord('C' + k), null, k);
  const p = newProject('t', 'C G'); p.tracks.bass.pattern = 'constructor'; p.tracks.drums.pattern = 'toString';
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(n.tracks.bass.pattern, 'off'); assert.equal(n.tracks.drums.pattern, 'off');
  const old = normalizeProject({ version: 1, prog: 'C G', sound: 'constructor' });
  assert.equal(old.tracks.chords.instrument, 'none');
  assert.equal(buildSong(newProject('t', 'CtoString')).song, null);
});

test('repeat expansion has a total cap and a plain error', () => {
  const t0 = Date.now();
  const bomb = parseProgression('((((C)x64)x64)x64)x64');
  assert.equal(bomb.chords.length, 0); assert.match(bomb.error, /too long/); assert.ok(bomb.bad.length);
  assert.throws(() => expandRepeats('((((C)x64)x64)x64)x64'), /too long/);
  const two = chordsFromText('((C G)x64)x64');
  assert.equal(two.chords.length, 0); assert.match(two.error, /too long/);
  assert.equal(chordsFromText('(C G)x64').chords.length, 128);
  assert.equal(chordsFromText('C G').error, '');
  assert.ok(Date.now() - t0 < 2000);
});

test('a chord symbol is one chord, even with repeat syntax in it', () => {
  const sym = '(((((((C)x64)x64)x64)x64)x64)x64)x64';
  const p = newProject('t', 'C'); p.chords[0].sym = sym;
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(n.chords.length, 0);
  const q = newProject('t', 'C'); q.chords[0].sym = 'C G';
  assert.equal(normalizeProject(JSON.parse(JSON.stringify(q))).chords.length, 0);
});

test('version checks: fractions, NaN, a chord list stamped version 1, a BOM', () => {
  assert.throws(() => normalizeProject({ version: 1.5, chords: [] }), ProjectError);
  assert.throws(() => normalizeProject({ version: NaN, chords: [] }), ProjectError);
  assert.throws(() => normalizeProject({ version: Infinity }), ProjectError);
  const p = normalizeProject({ version: 1, chords: [{ sym: 'C', beats: null, section: '' }, { sym: 'Am7', beats: 2, section: 'A' }] });
  assert.deepEqual(p.chords.map(c => c.sym), ['C', 'Am7']); assert.equal(p.chords[1].beats, 2);
  const back = parseProjectFile('﻿' + serializeProject(newProject('t')));
  assert.equal(back.name, 't');
});

test('melody notes are clamped to sensible ranges', () => {
  const p = newProject('t', 'C'); p.tracks.melody.notes = [{ t: 1e9, d: 5e-324, m: 60 }, { t: 2, d: 1e12, m: 60 }, { t: 1, d: 1, m: 60 }];
  const ns = normalizeProject(JSON.parse(JSON.stringify(p))).tracks.melody.notes;
  assert.equal(ns.length, 3);
  for (const n of ns) { assert.ok(n.t <= 8192); assert.ok(n.d >= 0.05 && n.d <= 256); }
});

test('parser: unclosed section, comma decimals, repeats inside names, brackets in sections', () => {
  const open = parseProgression('[Verse C G');
  assert.deepEqual(open.bad, ['[Verse']); assert.equal(open.chords.length, 2); assert.equal(open.chords[0].section, '');
  assert.equal(parseProgression('Am:1,5 C').chords[0].beats, 1.5);
  assert.equal(parseProgression('Am:1,5 C').chords.length, 2);
  const soft = parseProgression('[Verse (soft)x2] C');
  assert.equal(soft.chords[0].section, 'Verse (soft)x2'); assert.equal(soft.chords.length, 1);
  const p = newProject('t', 'C G'); p.chords[0].section = 'a]b[c';
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  const again = chordsFromText(chordsToText(n.chords)).chords;
  assert.deepEqual(again.map(c => [c.sym, c.section]), n.chords.map(c => [c.sym, c.section]));
});

test('minor-key numerals keep neighbouring degrees apart', () => {
  const key = { root: 9, minor: true }; // A minor
  const rn = sym => romanOf(parseChord(sym), key);
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'A', 'Bb', 'B'].map(rn);
  assert.equal(new Set(names).size, names.length, names.join(' '));
});

test('history: a clock that goes backwards does not merge edits for ever', () => {
  const h = createHistory();
  h.reset({ n: 0 });
  h.push({ n: 1 }, 'x', 10000); h.push({ n: 2 }, 'x', 10100);
  h.push({ n: 3 }, 'x', 5000); h.push({ n: 4 }, 'x', 5100);
  h.undo(); assert.equal(h.present.n, 2); h.undo(); assert.equal(h.present.n, 0);
});

const loopSong = fn => { const p = newProject('t', 'C G Am F'); fn(p); return buildSong(p).song; };

test('MIDI: solo is honoured like in the audio engine', () => {
  const s = loopSong(p => { p.tracks.bass.pattern = 'root'; p.tracks.drums.pattern = 'basic'; p.tracks.drums.solo = true; });
  assert.deepEqual(parseMidi(songToMidi(s)).tracks.slice(1).map(t => t.name), ['Drums']);
});

test('MIDI: arpeggios that re-strike a held pitch parse back cleanly and no note is cut short', () => {
  for (const inst of ['arp', 'crystal']) {
    const s = loopSong(p => { p.tracks.chords.instrument = inst; p.tracks.voices.mute = true; });
    const m = parseMidi(songToMidi(s)); // throws on a note-on that lands on a sounding pitch
    const notes = m.tracks.find(t => t.name === 'Chords').notes;
    assert.ok(notes.length > 8);
    for (const n of notes) assert.ok(n.off > n.on);
  }
});

test('MIDI: every track ends at the loop end', () => {
  const s = loopSong(p => { p.tracks.bass.pattern = 'root'; p.tracks.drums.pattern = 'soft'; p.tracks.chords.instrument = 'arp'; });
  const m = parseMidi(songToMidi(s)), end = Math.round(s.cycle / s.spb * 480);
  assert.ok(m.tracks.length >= 4);
  for (const t of m.tracks) assert.equal(t.ended, end, t.name);
});

test('MIDI: huge times and tiny tempos cannot overflow', () => {
  const m = parseMidi(encodeMidi({ bpm: 1, tracks: [{ name: 'x', channel: 0, notes: [{ t: 1e12, d: 1e12, m: 60 }, { t: 0, d: 1, m: 61 }] }] }));
  assert.equal(m.tempo, 0xffffff); assert.equal(m.tracks[1].notes.length, 2);
  assert.equal(parseMidi(encodeMidi({ bpm: NaN, tracks: [] })).tempo, 500000);
});
