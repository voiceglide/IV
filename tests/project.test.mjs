import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, exampleProject, EXAMPLES, normalizeProject, parseProjectFile, serializeProject, chordsFromText, chordsToText, ProjectError, VERSION, FORMAT, fileBase } from '../src/core/project.js';
import { buildSong } from '../src/core/song.js';
import { insertChord, removeChord, moveChord, duplicateChord, chordParts, chordSym } from '../src/core/edit.js';
import { createHistory } from '../src/core/history.js';

test('a new project is valid and survives a save / load round trip', () => {
  const p = newProject('My song', 'C G Am F');
  assert.equal(p.version, VERSION); assert.equal(p.format, FORMAT);
  const back = parseProjectFile(serializeProject(p));
  assert.deepEqual(back, p);
});

test('every built-in example builds a song with no error', () => {
  EXAMPLES.forEach((e, i) => {
    const { song, error } = buildSong(exampleProject(i));
    assert.equal(error, ''); assert.ok(song, e.name);
    assert.ok(song.cycle > 8 && song.cycle < 60, `${e.name}: ${song.cycle.toFixed(1)} s loop`);
  });
});

test('version 1 files (flat, old sound modes) migrate to the current format', () => {
  const old = { version: 1, name: 'Old one', prog: '(Dm7 G7 Cmaj7:8)x2', bpm: 96, beats: '4', key: '0', sound: 'piano', glide: '0.42', hook: 'Hi', question: 'Q?', title: 'T', handle: '@me' };
  const p = normalizeProject(old);
  assert.equal(p.version, VERSION); assert.equal(p.name, 'Old one'); assert.equal(p.tempo, 96); assert.equal(p.glide, 0.42);
  assert.equal(p.chords.length, 6); assert.equal(p.chords[2].beats, 8);
  assert.equal(p.tracks.chords.instrument, 'softpiano'); assert.equal(p.tracks.voices.mute, true);
  assert.deepEqual(p.text, { hook: 'Hi', question: 'Q?', reveal: 'T', watermark: '@me' });
  // a file with no version field is read as version 1
  assert.equal(normalizeProject({ prog: 'C F', bpm: 100 }).chords.length, 2);
});

test('damaged fields fall back to defaults instead of breaking the app', () => {
  const p = normalizeProject({ format: FORMAT, version: VERSION, name: 42, tempo: 'fast', key: 'H', glide: -3, chords: [{ sym: 'C' }, { sym: 'nope' }, null, { sym: 'G', beats: 1e9 }],
    tracks: { voices: { volume: 9, pan: -7 }, drums: { pattern: 'loud' }, melody: { notes: [{ t: 0, d: 1, m: 60 }, { t: 'x' }, { t: 1, d: -1, m: 60 }] } } });
  assert.equal(p.name, 'Untitled'); assert.equal(p.tempo, 90); assert.equal(p.key, 'auto'); assert.equal(p.glide, 0.02);
  assert.equal(p.chords.length, 2); assert.equal(p.chords[1].beats, 64);
  assert.equal(p.tracks.voices.volume, 1); assert.equal(p.tracks.voices.pan, -1); assert.equal(p.tracks.drums.pattern, 'off');
  assert.equal(p.tracks.melody.notes.length, 1);
});

test('files that are not projects are refused with a readable message', () => {
  for (const bad of ['', 'hello', '[1,2]', '{"a":1}', '{"version":"x"}', JSON.stringify({ version: VERSION, format: 'other', chords: [] })])
    assert.throws(() => parseProjectFile(bad), ProjectError, bad);
  assert.throws(() => parseProjectFile(JSON.stringify({ format: FORMAT, version: VERSION + 1 })), /newer version/);
});

test('chord text and chord items convert both ways', () => {
  const { chords, bad } = chordsFromText('[Verse] C G:2 [Chorus] (Am F)x2');
  assert.equal(bad.length, 0); assert.equal(chords.length, 6);
  assert.equal(chordsToText(chords), '[Verse] C G:2\n[Chorus] Am F Am F');
  assert.equal(chordsFromText(chordsToText(chords)).chords.length, 6);
});

test('chord edits: insert, duplicate, move, remove keep sections in place', () => {
  const p = newProject('x', '[A] C G [B] Am F');
  assert.equal(insertChord(p, 1, 'D'), 2); assert.equal(chordsToText(p.chords), '[A] C G D\n[B] Am F');
  assert.equal(duplicateChord(p, 0), 1); assert.equal(p.chords[1].sym, 'C'); assert.equal(p.chords[1].section, '');
  assert.equal(moveChord(p, 4, -1), 3); assert.equal(chordsToText(p.chords), '[A] C C G Am\n[B] D F');
  removeChord(p, 4); assert.equal(chordsToText(p.chords), '[A] C C G Am\n[B] F');
  assert.equal(moveChord(p, 0, -1), 0);
});

test('chord picker parts and symbols', () => {
  assert.deepEqual(chordParts('F#m7/E'), { root: 6, q: 'm7', bass: 4, rootName: 'F#' });
  assert.equal(chordSym(6, 'm7', 4, 'F#'), 'F#m7/E'); assert.equal(chordSym(1, '', -1), 'Db'); assert.equal(chordSym(0, 'maj7', 0), 'Cmaj7');
});

test('history: undo, redo, merge of rapid edits, limit', () => {
  const h = createHistory(3); h.reset('a');
  h.push('b', '', 0); h.push('c', 'typing', 1000); h.push('d', 'typing', 1200); // c and d merge
  assert.equal(h.present, 'd'); assert.equal(h.undo(), 'b'); assert.equal(h.undo(), 'a'); assert.equal(h.canUndo(), false);
  assert.equal(h.redo(), 'b'); h.push('e', '', 5000); assert.equal(h.canRedo(), false);
  for (const s of ['f', 'g', 'h', 'i']) h.push(s, '', 9000);
  let n = 0; while (h.canUndo()) { h.undo(); n++; } assert.equal(n, 3);
});

test('file names are safe', () => {
  assert.equal(fileBase({ name: 'Été / 2: “Mix”!' }), 't-2-mix'); assert.equal(fileBase({ name: '///' }), 'project');
});
