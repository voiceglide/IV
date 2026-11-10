// Unit checks on the Studio's music code and examples. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// (arrays from the sandbox have another prototype: compare lengths/strings, not deepEqual)
// theory.js and plan.js are plain browser scripts: run them in a sandbox and pull out what we need
const ctx = vm.createContext({});
vm.runInContext(read('studio/src/theory.js'), ctx);
const T = vm.runInContext('({parseProgression, chooseVoicings, detectKey, romanOf})', ctx);
vm.runInContext(read('studio/src/plan.js'), ctx);
const PLAN = vm.runInContext('PLAN', ctx);

// loop length exactly as the Studio computes it (default 4 beats per chord)
const loopSeconds = (prog, bpm) => T.parseProgression(prog).chords.reduce((s, c) => s + (c.beats || 4) * 60 / bpm, 0);

test('chord parser handles slash chords, sharps and qualities', () => {
  const { chords, bad } = T.parseProgression('B/D# G/D C#dim Em7 Cmaj9 G7sus4');
  assert.equal(bad.length, 0, bad.join(' '));
  assert.equal(chords.map(c => c.label).join(' '), 'B/D♯ G/D C♯dim Em7 Cmaj9 G7sus4');
  assert.equal(chords[0].bass, 3); // D#
});

test('repeats and sections expand', () => {
  const { chords } = T.parseProgression('[A] (G:6 C:6)x2 [B] Em:6');
  assert.equal(chords.length, 5);
  assert.equal(chords[4].section, 'B');
});

test('there are built-in examples', () => {
  assert.ok(PLAN.length >= 1);
});

for (const w of PLAN) {
  test(`example · ${w.name}: parses, voices, loop length 20–32 s`, () => {
    for (const k of ['file', 'name', 'prog', 'bpm', 'key', 'startAt', 'hook', 'q']) assert.ok(w[k] !== undefined, `missing ${k}`);
    const { chords, bad } = T.parseProgression(w.prog);
    assert.equal(bad.length, 0, 'unrecognised chords: ' + bad.join(' '));
    assert.ok(T.chooseVoicings([...chords, ...chords, ...chords]), 'no voicing found');
    const s = loopSeconds(w.prog, w.bpm);
    assert.ok(s >= 20 && s <= 32, `loop is ${s.toFixed(1)} s`);
  });
}
