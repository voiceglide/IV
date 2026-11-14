// The loop scheduler, run in Node against a recording fake AudioContext: edits are heard on the next pass, finished passes are let go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, emptySteps } from '../src/core/project.js';
import { buildSong } from '../src/core/song.js';
import { createLooper, buildChannels } from '../src/audio/engine.js';
import { fakeContext, kicksOf } from './fakeaudio.mjs';

const songOf = (text, fn = () => {}) => { const p = newProject('t', text); fn(p); const r = buildSong(p); assert.ok(r.song, r.error); return r.song; };
const start = (song, ac) => {
  const sess = { dry: ac.createGain(), wet: ac.createGain() };
  const built = buildChannels(ac, sess, song.tracks);
  return createLooper(ac, built, song, 0.15, song.vs, {});
};

test('an edit of the drum grid, melody and bass pattern while looping is heard in the next pass', () => {
  const song = songOf('C:4 G:4', p => { p.tempo = 120; p.tracks.drums.pattern = 'off'; p.tracks.bass.pattern = 'off'; p.tracks.melody.notes = []; });
  const ac = fakeContext(), lp = start(song, ac);
  lp.pump();                                    // pass 0
  const n0 = ac.nodes.length;
  assert.equal(kicksOf(ac), 0);
  // the app replaces the tracks object (immutable store) and hands it to the engine; no restart
  const steps = emptySteps(); steps.kick.fill(3);
  const tracks = { ...song.tracks, drums: { ...song.tracks.drums, pattern: 'custom', steps }, bass: { ...song.tracks.bass, pattern: 'pulse' },
    melody: { ...song.tracks.melody, notes: [{ t: 0, d: 1, m: 72 }, { t: 2, d: 1, m: 76 }] } };
  lp.setTracks(tracks);
  assert.equal(kicksOf(ac, n0), 0, 'what is already scheduled is not touched');
  ac.currentTime = song.cycle - 1;              // inside the lookahead of pass 1
  lp.pump();
  const kicks = kicksOf(ac, n0);
  assert.ok(kicks >= 16, `kicks in the next pass: ${kicks}`);
  const made = ac.nodes.slice(n0).filter(n => n.__rec.type === 'Oscillator').length;
  assert.ok(made > kicks + 20, 'bass and melody notes were scheduled too: ' + made);
});

test('finished passes are let go: the nodes the looper holds plateau over 60 s of looping', () => {
  const song = songOf('C:1 G:1 Am:1 F:1', p => { p.tempo = 300; p.tracks.drums.pattern = 'four'; p.tracks.bass.pattern = 'pulse'; p.tracks.chords.instrument = 'softpiano'; });
  const ac = fakeContext(), lp = start(song, ac), held = [];
  for (let t = 0; t <= 60.001; t += 0.2) { ac.currentTime = t; lp.pump(); if ([20, 40, 60].some(x => Math.abs(t - x) < 0.01)) held.push(lp.retained()); }
  assert.ok(song.cycle < 2, 'many passes in 60 s');
  assert.equal(held[0], held[1], `held at 20 s ${held[0]}, 40 s ${held[1]}, 60 s ${held[2]}`); assert.equal(held[1], held[2]);
  const gone = ac.nodes.filter(n => n.__rec.disconnected > 0).length;
  assert.ok(gone > 100, 'old nodes were disconnected: ' + gone);
});
