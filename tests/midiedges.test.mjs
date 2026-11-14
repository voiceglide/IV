// MIDI export at the loop edges: every note starts inside the loop and ends no later than the loop's last tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../src/core/project.js';
import { buildSong } from '../src/core/song.js';
import { songToMidi } from '../src/core/midiexport.js';
import { parseMidi } from './midi-parse.mjs';

const midiOf = (text, tempo, notes) => {
  const p = newProject('t', text); p.tempo = tempo; p.tracks.melody.notes = notes;
  const r = buildSong(p); assert.ok(r.song, r.error);
  const m = parseMidi(songToMidi(r.song)), tr = m.tracks.find(t => t.name === 'Melody'); assert.ok(tr);
  return { m, tr, loop: Math.round(r.song.beats * m.ppq) };
};

test('a note that rounds to the loop end is dropped, not struck on the next downbeat', () => {
  const { tr, loop } = midiOf('C:4 G:4', 90, [{ t: 0, d: 1, m: 60 }, { t: 7.9999, d: 1, m: 64 }]);
  assert.equal(loop, 3840);
  assert.deepEqual(tr.notes.map(n => n.m), [60]);
  assert.ok(tr.notes.every(n => n.on >= 0 && n.on < loop && n.off <= loop), JSON.stringify(tr.notes));
  assert.ok(tr.ended <= loop, 'the track ends with the loop: ' + tr.ended);
});

test('a note cut by the loop end keeps its off inside the loop (no 0.05-beat minimum past the end)', () => {
  const { tr, loop } = midiOf('C:1 G:1', 100, [{ t: 1.99, d: 3, m: 67 }, { t: 0, d: 0.5, m: 60 }]);
  assert.equal(loop, 960);
  for (const n of tr.notes) assert.ok(n.on < loop && n.off <= loop && n.off > n.on, JSON.stringify(n));
  assert.ok(tr.notes.some(n => n.m === 67), 'the cut note is still there');
});

test('every melody onset is inside [0, loop) and every off is at most the loop, for odd positions', () => {
  const notes = []; for (let i = 0; i < 40; i++) notes.push({ t: (i * 0.37) % 8, d: 0.05 + (i % 7) * 0.6, m: 50 + i });
  notes.push({ t: 7.9995, d: 0.05, m: 100 }, { t: 7.9991, d: 4, m: 101 });
  const { tr, loop } = midiOf('C:4 G:4', 90, notes);
  for (const n of tr.notes) assert.ok(n.on >= 0 && n.on < loop && n.off <= loop && n.off > n.on, JSON.stringify(n));
});
