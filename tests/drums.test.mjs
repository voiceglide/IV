import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, normalizeProject, serializeProject, VERSION, FORMAT, DRUM_PRESETS, DRUM_LANES, emptySteps } from '../src/core/project.js';
import { buildSong } from '../src/core/song.js';
import { drumEvents, gridEvents } from '../src/core/patterns.js';
import { songToMidi } from '../src/core/midiexport.js';
import { parseMidi } from './midi-parse.mjs';

const songOf = (chords, fn = () => {}) => { const p = newProject('t', chords); fn(p); const r = buildSong(p); assert.ok(r.song, r.error); return r.song; };
const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-6, `${m} ${a} vs ${b}`);

test('format v4: a new project has an empty grid and no swing', () => {
  const p = newProject('x'); assert.equal(VERSION, 4); assert.equal(p.version, 4);
  assert.equal(p.tracks.drums.swing, 0); assert.deepEqual(Object.keys(p.tracks.drums.steps), DRUM_LANES);
  for (const l of DRUM_LANES) assert.deepEqual(p.tracks.drums.steps[l], new Array(16).fill(0));
  assert.deepEqual(normalizeProject(JSON.parse(serializeProject(p))), p);
});

test('migration v2 → v3 → v4 and v3 → v4: the old pattern becomes a grid, nothing else changes', () => {
  const v3 = JSON.parse(serializeProject(newProject('three', 'C G Am F'))); v3.version = 3; v3.tracks.drums = { volume: 0.5, pan: 0, mute: false, solo: false, pattern: 'basic' };
  const a = normalizeProject(v3);
  assert.equal(a.version, 4); assert.equal(a.tracks.drums.pattern, 'basic'); assert.equal(a.tracks.drums.swing, 0); assert.equal(a.tracks.drums.volume, 0.5);
  assert.deepEqual(a.tracks.drums.steps, DRUM_PRESETS.basic);
  const off = JSON.parse(serializeProject(newProject('off'))); off.version = 3; off.tracks.drums = { pattern: 'off' };
  assert.deepEqual(normalizeProject(off).tracks.drums.steps, emptySteps());
  // a version 2 file (no chord ids, no glide style) goes through both steps
  const v2 = { format: FORMAT, version: 2, id: 'abc', name: 'two', createdAt: 1, updatedAt: 2, tempo: 100, beatsPerChord: 4, key: '0', glide: 0.3,
    chords: [{ sym: 'C', beats: null, section: '' }, { sym: 'G', beats: 2, section: '' }], text: {},
    tracks: { drums: { volume: 0.7, pan: 0, mute: false, solo: false, pattern: 'four' } } };
  const b = normalizeProject(v2);
  assert.equal(b.version, 4); assert.equal(b.name, 'two'); assert.equal(b.chords.length, 2); assert.deepEqual(b.tracks.drums.steps, DRUM_PRESETS.four);
  // and a version 1 file
  const c = normalizeProject({ version: 1, prog: 'C F', bpm: 100 });
  assert.equal(c.version, 4); assert.equal(c.tracks.drums.pattern, 'off'); assert.deepEqual(c.tracks.drums.steps, emptySteps());
  // the migrated preset is a copy: editing it leaves the preset alone
  a.tracks.drums.steps.kick[1] = 3; assert.equal(DRUM_PRESETS.basic.kick[1], 0);
});

test('grid values are validated and clamped', () => {
  const p = JSON.parse(serializeProject(newProject('x')));
  p.tracks.drums = { pattern: 'custom', swing: 9, steps: { kick: [1, 2, 3, 4, -1, 'x', null, 2.6, ...new Array(40).fill(3)], nope: [3], snare: 'xxxx', toString: [3], hat: { 0: 3 } } };
  let n = normalizeProject(p).tracks.drums;
  assert.equal(n.pattern, 'custom'); assert.equal(n.swing, 0.6);
  assert.deepEqual(Object.keys(n.steps), DRUM_LANES); assert.equal(n.steps.kick.length, 16);
  assert.deepEqual(n.steps.kick.slice(0, 9), [1, 2, 3, 3, 0, 0, 0, 3, 3]);
  assert.deepEqual(n.steps.snare, new Array(16).fill(0)); assert.deepEqual(n.steps.hat, new Array(16).fill(0));
  p.tracks.drums = { pattern: 'custom', swing: -2, steps: 5 }; n = normalizeProject(p).tracks.drums;
  assert.equal(n.swing, 0); assert.deepEqual(n.steps, emptySteps());
  p.tracks.drums = { pattern: 'constructor', swing: 'a', steps: null }; assert.equal(normalizeProject(p).tracks.drums.pattern, 'off');
});

test('scheduler: sixteenths on the bar clock, velocities by level, swing on the off-beat sixteenths', () => {
  const grid = emptySteps(); grid.kick[0] = 3; grid.snare[4] = 2; grid.hat[1] = 1; grid.hat[2] = 2; grid.hat[3] = 3;
  const spb = 0.5, step = 0.125, cycle = 8 * spb; // two bars
  const ev = gridEvents(grid, 0, { cycle, spb, copies: 1 });
  const at = (t, kind) => ev.find(e => e.kind === kind && Math.abs(e.t - t) < 1e-9);
  assert.equal(at(0, 'kick').v, 1); assert.equal(at(4 * step, 'snare').v, 0.7);
  assert.equal(at(step, 'hat').v, 0.4); assert.equal(at(2 * step, 'hat').v, 0.7); assert.equal(at(3 * step, 'hat').v, 1);
  assert.equal(ev.length, 10, 'two bars of five hits'); near(ev.filter(e => e.kind === 'kick')[1].t, 2, 'second bar starts on beat 5');
  const sw = gridEvents(grid, 0.5, { cycle, spb, copies: 1 });
  near(sw.find(e => e.kind === 'hat' && e.v === 0.4).t, step + 0.5 * step, 'off-beat 16th is late');
  near(sw.find(e => e.kind === 'hat' && e.v === 0.7).t, 2 * step, 'on-beat 16th is not'); near(sw.find(e => e.kind === 'hat' && e.v === 1).t, 3 * step + 0.5 * step, 'third');
  near(gridEvents(grid, 5, { cycle, spb, copies: 1 }).find(e => e.v === 0.4).t, step + 0.6 * step, 'swing is capped at 0.6');
});

test('drums follow the bar clock, not the chords: one-beat chords still get the whole bar', () => {
  const s = songOf('C G Am F', p => { p.beatsPerChord = 1; p.tracks.drums.pattern = 'basic'; });
  const loop = drumEvents(s, 'basic', { lo: s.cycle, hi: 2 * s.cycle - 1e-6 });
  assert.ok(loop.length > 0);
  const kinds = new Set(loop.map(e => e.kind)); assert.ok(kinds.has('kick') && kinds.has('snare') && kinds.has('hat'), 'not only kicks');
  const snares = loop.filter(e => e.kind === 'snare').map(e => +((e.t - s.cycle) / s.spb).toFixed(6));
  assert.deepEqual(snares, [1, 3], 'snare on beats 2 and 4 of the bar, whatever the chord');
  // a long chord is no different: the pattern does not restart at a chord change
  const t = songOf('C:8 G:8', p => { p.tracks.drums.pattern = 'basic'; });
  const kicks = drumEvents(t, 'basic', { lo: t.cycle, hi: 2 * t.cycle - 1e-6 }).filter(e => e.kind === 'kick').map(e => +((e.t - t.cycle) / t.spb).toFixed(6));
  assert.deepEqual(kicks, [0, 2, 4, 6, 8, 10, 12, 14]);
});

test('custom grid: the song reads steps and swing from the project; a loop that is not whole bars restarts on the one', () => {
  const s = songOf('C G Am F', p => { const d = p.tracks.drums; d.pattern = 'custom'; d.swing = 0.3; d.steps.clap[3] = 2; d.steps.tom[0] = 1; });
  const ev = drumEvents(s, 'custom', { lo: 0, hi: 999 });
  const claps = ev.filter(e => e.kind === 'clap'), toms = ev.filter(e => e.kind === 'tom');
  assert.equal(toms.length, 12, 'one per bar: 4 bars in 3 copies'); assert.equal(claps.length, 12);
  near(claps[0].t, 3 * s.spb / 4 + 0.3 * s.spb / 4, 'swung'); assert.equal(claps[0].v, 0.7);
  assert.deepEqual(drumEvents(s, 'off', { lo: 0, hi: 99 }), []);
  const odd = songOf('C:3 G:3', p => { p.tracks.drums.pattern = 'custom'; p.tracks.drums.steps.kick[0] = 3; });
  const k = drumEvents(odd, 'custom', { lo: odd.cycle, hi: 2 * odd.cycle - 1e-6 }).map(e => +((e.t - odd.cycle) / odd.spb).toFixed(6));
  assert.deepEqual(k, [0, 4], 'bar 2 is cut at the loop end');
  assert.ok(drumEvents(s, 'custom', { lo: 0, hi: 999, from: s.cycle + 2 }).every(e => e.t >= s.cycle + 2 - 1e-6), 'nothing before the play head');
});

test('MIDI export writes the grid on channel 10 with General MIDI notes and velocities', () => {
  const s = songOf('C G Am F', p => { const d = p.tracks.drums; d.pattern = 'custom'; d.swing = 0.4; d.steps.kick[0] = 3; d.steps.snare[4] = 2; d.steps.open[7] = 1; d.steps.clap[8] = 3; d.steps.tom[12] = 2; d.steps.hat[1] = 1; });
  const m = parseMidi(songToMidi(s)), tr = m.tracks.find(t => t.name === 'Drums'); assert.ok(tr, 'a Drums track');
  assert.ok(tr.notes.every(n => n.ch === 9), 'channel 10');
  const get = note => tr.notes.filter(n => n.m === note).sort((a, b) => a.on - b.on), beat = n => n.on / m.ppq;
  for (const [note, label] of [[36, 'kick'], [38, 'snare'], [46, 'open hat'], [39, 'clap'], [45, 'tom'], [42, 'hat']]) assert.equal(get(note).length, 4, label + ' once per bar');
  assert.equal(get(36)[0].v, 127); assert.equal(get(38)[0].v, 89); assert.equal(get(46)[0].v, 51);
  near(beat(get(36)[0]), 0, 'kick on the one'); near(beat(get(38)[0]), 1, 'snare on beat 2'); near(beat(get(39)[0]), 2, 'clap on beat 3'); near(beat(get(36)[1]), 4, 'next bar');
  assert.ok(beat(get(42)[0]) > 0.25 + 0.05, 'swung hat is late: ' + beat(get(42)[0]));
});
