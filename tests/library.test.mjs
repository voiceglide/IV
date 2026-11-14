import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, progressionSyms, surprise, keyString } from '../src/core/library.js';
import { transposeChords, moveChordTo, insertChord } from '../src/core/edit.js';
import { parseChord } from '../src/core/theory.js';

test('every library progression is made of valid chords in every key', () => {
  for (const prog of LIBRARY) for (let r = 0; r < 12; r++) for (const s of progressionSyms(prog, r)) assert.ok(parseChord(s), `${prog.id} in ${r}: ${s}`);
});
test('the pop progression in C and in D', () => {
  assert.deepEqual(progressionSyms(LIBRARY[0], 0), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(progressionSyms(LIBRARY[0], 2), ['D', 'A', 'Bm', 'G']);
  assert.equal(keyString(LIBRARY[0], 7), '7');
  assert.equal(keyString(LIBRARY.find(p => p.minor), 9), '9:m');
});
test('surprise gives a progression from the library', () => {
  const s = surprise(() => 0.5); assert.ok(LIBRARY.includes(s.prog)); assert.equal(s.syms.length, s.prog.steps.length);
});
test('transpose moves chords, slash bass and key', () => {
  const p = { key: '0', chords: [{ sym: 'C/E' }, { sym: 'Am7' }] };
  transposeChords(p, 3); assert.deepEqual(p.chords.map(c => c.sym), ['Eb/G', 'Cm7']); assert.equal(p.key, '3');
  transposeChords(p, -4); assert.equal(p.key, '11'); assert.equal(p.chords[0].sym, 'B/Eb');
});
test('moveChordTo reorders and keeps section labels in place; insertChord gives an id', () => {
  const p = { chords: [{ id: 'a', section: 'Verse' }, { id: 'b', section: '' }, { id: 'c', section: 'Chorus' }] };
  assert.equal(moveChordTo(p, 0, 2), 2);
  assert.deepEqual(p.chords.map(c => c.id + c.section), ['bVerse', 'c', 'aChorus']);
  const q = { chords: [] }; insertChord(q, -1, 'G'); assert.ok(q.chords[0].id);
});
test('tap tempo averages the last taps', async () => {
  const { tempoFromTaps } = await import('../src/core/edit.js');
  assert.equal(tempoFromTaps([0]), null);
  assert.equal(tempoFromTaps([0, 500, 1000, 1500]), 120);
  assert.equal(tempoFromTaps([0, 100000]), 20);
});
