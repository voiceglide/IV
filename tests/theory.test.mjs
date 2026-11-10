// Unit checks on the music code. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgression, parseChord, chooseVoicings, detectKey, romanOf, Q } from '../src/core/theory.js';

test('chord parser handles slash chords, sharps and qualities', () => {
  const { chords, bad } = parseProgression('B/D# G/D C#dim Em7 Cmaj9 G7sus4');
  assert.equal(bad.length, 0, bad.join(' '));
  assert.equal(chords.map(c => c.label).join(' '), 'B/D♯ G/D C♯dim Em7 Cmaj9 G7sus4');
  assert.equal(chords[0].bass, 3);
});

test('repeats and sections expand', () => {
  const { chords } = parseProgression('[A] (C G)x2 [B] Am:2 F');
  assert.equal(chords.length, 6);
  assert.equal(chords[0].section, 'A'); assert.equal(chords[4].section, 'B'); assert.equal(chords[4].beats, 2);
});

test('unknown tokens are reported, not guessed', () => {
  const { chords, bad } = parseProgression('C Hm7 G Xyz');
  assert.equal(chords.length, 2); assert.deepEqual(bad, ['Hm7', 'Xyz']);
});

test('every chord quality on every root can be voiced', () => {
  for (const q of Object.keys(Q)) for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
    const c = parseChord(root + q); assert.ok(c, root + q);
    const v = chooseVoicings([c, c]); assert.ok(v, `voicing for ${root}${q}`);
    assert.ok(v[0].bass >= 36 && v[0].bass <= 50); assert.ok(Math.max(...v[0].upper) <= 81);
  }
});

test('voice leading keeps common tones between I and vi', () => {
  const { chords } = parseProgression('C Am');
  const v = chooseVoicings(chords);
  const shared = v[0].upper.filter(m => v[1].upper.includes(m));
  assert.ok(shared.length >= 2, 'C and Am share two upper notes');
});

test('key detection and roman numerals', () => {
  const { chords } = parseProgression('C G Am F');
  const key = detectKey(chords);
  assert.equal(key.root, 0); assert.equal(key.minor, false);
  assert.equal(chords.map(c => romanOf(c, key)).join(' '), 'I V vi IV');
  const m = parseProgression('Am F C G').chords, km = detectKey(m);
  assert.equal(km.root, 9); assert.equal(km.minor, true);
});
