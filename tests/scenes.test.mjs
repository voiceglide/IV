import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, applyScene, sceneMatches, currentScene } from '../src/core/scenes.js';
import { newProject, normalizeProject, BASS_PATTERNS, DRUM_PATTERNS, GLIDE_CURVES } from '../src/core/project.js';
import { buildSong } from '../src/core/song.js';
import { GLIDE } from '../src/audio/glides/index.js';
import { CHORD_INSTRUMENTS } from '../src/audio/instruments/index.js';

test('there are at least eight scenes with unique ids and names', () => {
  assert.ok(SCENES.length >= 8);
  assert.equal(new Set(SCENES.map(s => s.id)).size, SCENES.length);
  assert.equal(new Set(SCENES.map(s => s.name)).size, SCENES.length);
});

test('every scene uses only ids that exist', () => {
  for (const s of SCENES) {
    assert.ok(GLIDE[s.sound], `${s.id}: sound ${s.sound}`);
    for (const k of ['bass', 'inner', 'top']) assert.ok(s.split[k] === null || GLIDE[s.split[k]], `${s.id}: split ${k}`);
    assert.ok(s.layer === 'none' || CHORD_INSTRUMENTS.some(i => i.id === s.layer), `${s.id}: layer ${s.layer}`);
    assert.ok(Object.hasOwn(BASS_PATTERNS, s.bass), `${s.id}: bass ${s.bass}`);
    assert.ok(Object.hasOwn(DRUM_PATTERNS, s.drums), `${s.id}: drums ${s.drums}`);
    assert.ok(GLIDE_CURVES.includes(s.style.curve));
    for (const x of [s.style.vibrato, s.style.swell, ...Object.values(s.mix)]) assert.ok(x >= 0 && x <= 1);
    assert.ok(s.glide >= 0.02 && s.glide <= 2);
  }
});

test('applying a scene gives a valid project that builds and matches only that scene', () => {
  for (const s of SCENES) {
    const p = newProject('x', 'C G Am F'); p.tracks.melody.notes = [{ t: 0, d: 1, m: 60 }]; p.tracks.drums.mute = true;
    const chords = JSON.stringify(p.chords);
    applyScene(p, s);
    assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(p))).tracks, p.tracks, s.id);
    assert.ok(buildSong(p).song, s.id);
    assert.equal(/** @type {any} */(currentScene(p)).id, s.id);
    assert.equal(SCENES.filter(o => sceneMatches(p, o)).length, 1);
    assert.equal(JSON.stringify(p.chords), chords); assert.equal(p.tracks.melody.notes.length, 1); assert.equal(p.tracks.drums.mute, true);
  }
});

test('changing one setting leaves no scene highlighted', () => {
  const p = newProject(); applyScene(p, SCENES[1]); p.tracks.voices.split.top = 'flute';
  assert.equal(currentScene(p), null);
});
