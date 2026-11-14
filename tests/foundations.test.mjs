// Foundations round: parser limits and hostile text, the chord cap at the edit, bad keys, and the section round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgression, MAX_CHORDS } from '../src/core/theory.js';
import { newProject, normalizeProject, parseProjectFile, chordsFromText, chordsToText, ProjectError, serializeProject } from '../src/core/project.js';
import { insertChord, duplicateChord, setLimitNotice, atChordLimit, MSG_CHORD_LIMIT } from '../src/core/edit.js';

test('an unmatched "[" is one bad token and never swallows the chords after it', () => {
  const r = chordsFromText('[Verse C G [Chorus] Am F');
  assert.deepEqual(r.bad, ['[Verse']);
  assert.deepEqual(r.chords.map(c => [c.sym, c.section]), [['C', ''], ['G', ''], ['Am', 'Chorus'], ['F', '']]);
  assert.deepEqual(chordsFromText('C [a [b [c] D').chords.map(c => c.sym), ['C', 'D']);
  assert.deepEqual(chordsFromText('C ] G').bad, [']']);
  assert.deepEqual(chordsFromText('[Verse] C G').bad, []);
});

test('a section name reads the same from text and after a reload', () => {
  for (const name of ['Verse 1', 'Ver\nse', 'a'.repeat(90), ' x ', 'a]b[c']) {
    const p = newProject('t', 'C G'); p.chords[0].section = name;
    const n = normalizeProject(JSON.parse(JSON.stringify(p)));
    const viaText = chordsFromText(chordsToText(n.chords)).chords;
    assert.deepEqual(viaText.map(c => c.section), n.chords.map(c => c.section), JSON.stringify(name));
  }
  const multi = chordsFromText('[Ver\nse] C').chords[0].section;
  const p = newProject('t', 'C'); p.chords[0].section = multi;
  assert.equal(normalizeProject(JSON.parse(JSON.stringify(p))).chords[0].section, multi);
  const long = chordsFromText('[' + 'a'.repeat(90) + '] C').chords[0].section;
  assert.equal(long.length, 60);
});

test('hostile text is parsed in linear time', () => {
  const cases = ['['.repeat(2e5), '[a'.repeat(1e5), '('.repeat(2e5), '"'.repeat(2e5), '[ ]'.repeat(7e4), ')x9'.repeat(7e4)];
  for (const s of cases) {
    const t0 = performance.now();
    chordsFromText(s);
    assert.ok(performance.now() - t0 < 200, `${s.slice(0, 6)} took ${Math.round(performance.now() - t0)} ms`);
  }
  // just under the size limit: many brackets, nested groups, long runs of "[a"
  for (const s of ['[a'.repeat(9e3), '['.repeat(19999), '('.repeat(1e4) + 'C' + ')x2'.repeat(5e3), '[ '.repeat(1e4)]) {
    const t0 = performance.now();
    chordsFromText(s);
    assert.ok(performance.now() - t0 < 200, `${s.slice(0, 6)} took ${Math.round(performance.now() - t0)} ms`);
  }
});

test('the parser still reads repeats, lyrics, comma beats and nested groups', () => {
  assert.deepEqual(parseProgression('((C G)x2 Am)x2').chords.map(c => c.label), ['C', 'G', 'C', 'G', 'Am', 'C', 'G', 'C', 'G', 'Am']);
  assert.equal(parseProgression('(C) x3').chords.length, 3);
  assert.equal(parseProgression('"la la" C').chords[0].lyric, 'la la');
  assert.equal(parseProgression('Am:1,5 C').chords[0].beats, 1.5);
  assert.equal(parseProgression('(C G').chords.length, 2);
});

test('a progression over the chord cap keeps its first chords for callers that need them', () => {
  const r = parseProgression('((C G)x64)x5');
  assert.equal(r.chords.length, 0); assert.ok(r.error); assert.equal(r.first.length, MAX_CHORDS);
});

test('the chord cap holds at the edit', () => {
  const p = newProject('t', 'C');
  const heard = []; setLimitNotice(m => heard.push(m));
  try {
    while (p.chords.length < MAX_CHORDS) insertChord(p, p.chords.length - 1, 'G');
    assert.equal(atChordLimit(p), true);
    const i = insertChord(p, 3, 'D'); assert.equal(p.chords.length, MAX_CHORDS); assert.ok(p.chords[i]);
    const j = duplicateChord(p, 7); assert.equal(p.chords.length, MAX_CHORDS); assert.equal(j, 7);
    assert.equal(heard.length, 2); assert.equal(heard[0], MSG_CHORD_LIMIT); assert.match(MSG_CHORD_LIMIT, /512 chords/);
    p.chords.pop();
    assert.equal(atChordLimit(p), false); insertChord(p, 0, 'D'); assert.equal(p.chords.length, MAX_CHORDS);
    // what is in memory is exactly what a reload keeps
    assert.equal(normalizeProject(JSON.parse(JSON.stringify(p))).chords.length, p.chords.length);
  } finally { setLimitNotice(null); }
});

test('a file with too many chords keeps the first ones and says so', () => {
  const v1 = JSON.stringify({ version: 1, name: 'Long', prog: '(C G Am F C G Am F C)x64' });
  const notes = [];
  const p = parseProjectFile(v1, notes);
  assert.equal(p.chords.length, MAX_CHORDS); assert.equal(p.chords[0].sym, 'C');
  assert.equal(notes.length, 1); assert.match(notes[0], /first 512/);
  const big = newProject('t', 'C'); big.chords = Array.from({ length: 600 }, (_, i) => ({ id: 'i' + i, sym: 'G', beats: null, section: '' }));
  const notes2 = [];
  assert.equal(parseProjectFile(serializeProject(big), notes2).chords.length, MAX_CHORDS);
  assert.equal(notes2.length, 1);
  const quiet = []; parseProjectFile(serializeProject(newProject('t')), quiet); assert.deepEqual(quiet, []);
});

test('an odd key is a ProjectError or "auto", never a TypeError', () => {
  const weird = [{ toString: 1 }, { toString() { return '3'; } }, [], null, true, { valueOf: 1 }, Symbol.iterator === 0 ? 0 : 7];
  for (const key of weird) {
    for (const raw of [{ version: 4, format: 'chord-project', key }, { version: 1, prog: 'C', key }, { version: 2, chords: [], key }]) {
      let n;
      try { n = normalizeProject(raw); } catch (e) { assert.ok(e instanceof ProjectError, String(e)); continue; }
      assert.match(n.key, /^(auto|([0-9]|1[01])(:m)?)$/);
    }
  }
  assert.equal(normalizeProject({ version: 4, format: 'chord-project', key: { toString: 1 } }).key, 'auto');
  assert.equal(normalizeProject({ version: 1, prog: 'C', key: 5 }).key, '5');
});
