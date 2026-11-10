import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../src/core/project.js';
import { buildSong, pitchAt, slotPitch, idxAt } from '../src/core/song.js';
import { chordEvents, bassEvents, drumEvents, melodyEvents, limitPolyphony } from '../src/core/patterns.js';
import { encodeMidi } from '../src/core/midi.js';
import { songToMidi } from '../src/core/midiexport.js';
import { encodeWav } from '../src/core/wav.js';

const songOf = (text, fn) => { const p = newProject('t', text); if (fn) fn(p); return buildSong(p).song; };
const STYLES = ['tied', 'block', 'strum', 'arp', 'arpHigh', 'sweep', 'roll'];

test('the loop is seamless: the window is one cycle and the voices match at both ends', () => {
  const s = songOf('C G Am F');
  assert.ok(Math.abs((s.ve - s.vs) - s.cycle) < 1e-9);
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(pitchAt(s, k, s.vs) - pitchAt(s, k, s.ve)) < 1e-9);
  assert.equal(idxAt(s, s.starts[5] + 0.01), 5);
});

test('voices glide: just before a change the pitch is between the two chords', () => {
  const s = songOf('C F'), i = s.n, k = [0, 1, 2, 3].find(x => slotPitch(s, i, x) !== slotPitch(s, i + 1, x));
  const a = slotPitch(s, i, k), b = slotPitch(s, i + 1, k), mid = pitchAt(s, k, s.starts[i + 1] - s.glide / 2);
  assert.ok(mid > Math.min(a, b) && mid < Math.max(a, b)); assert.equal(pitchAt(s, k, s.starts[i + 1]), b);
});

test('an empty or broken progression gives no song and a plain message', () => {
  assert.equal(buildSong(newProject('t', '')).song, null);
  const p = newProject('t', 'C'); p.chords.push({ sym: 'Zz', beats: null, section: '' });
  const r = buildSong(p); assert.equal(r.song, null); assert.match(r.error, /not a chord/);
});

test('every style starts its first note exactly on each chord change', () => {
  const s = songOf('C G:2 Am F:8'), span = { lo: s.vs - 4, hi: s.ve + 1 };
  for (const style of STYLES) {
    const ev = chordEvents(s, style, span);
    assert.ok(ev.length > 0, style);
    for (let i = s.n; i < 2 * s.n; i++) {
      if (style === 'tied') continue; // tied notes may be held over a change by design
      assert.ok(ev.some(e => Math.abs(e.t - s.starts[i]) < 1e-9), `${style}: a note on chord ${i}`);
    }
    for (const e of ev) { assert.ok(e.d > 0 && isFinite(e.t) && e.v > 0 && e.v <= 1.2, style); assert.ok(e.m >= 24 && e.m <= 108, `${style} note ${e.m}`); }
  }
});

test('tied notes are struck again when playback starts in the middle', () => {
  const s = songOf('C Am'), from = s.starts[s.n + 1] - 0.3;
  const ev = chordEvents(s, 'tied', { lo: s.vs - 4, hi: s.ve + 1, from });
  const first = ev.filter(e => Math.abs(e.t - s.starts[s.n + 1]) < 1e-9);
  assert.equal(first.length, new Set([s.v[s.n + 1].bass, ...s.v[s.n + 1].upper]).size, 'the whole chord sounds at the first change after the play head');
  assert.ok(ev.every(e => e.t + e.d > from));
});

test('polyphony limit never lets more than max notes overlap', () => {
  const ev = []; for (let i = 0; i < 40; i++) ev.push({ t: i * 0.1, d: 5, m: 60 + (i % 12), v: 1 });
  const out = limitPolyphony(ev, 6);
  assert.equal(out.length, 40);
  for (const e of out) assert.ok(out.filter(o => o.t <= e.t + 1e-9 && o.t + o.d > e.t + 1e-6).length <= 6);
});

test('bass, drum and melody patterns stay inside the song', () => {
  const s = songOf('C G Am F', p => { p.tracks.melody.notes = [{ t: 0, d: 1, m: 72 }, { t: 15.5, d: 4, m: 74 }, { t: 99, d: 1, m: 60 }]; });
  const span = { lo: s.vs - 4, hi: s.ve + 1 };
  for (const pat of ['root', 'pulse', 'fifth', 'octave']) { const ev = bassEvents(s, pat, span); assert.ok(ev.length, pat); for (const e of ev) assert.ok(e.m >= 28 && e.m <= 60, `${pat} ${e.m}`); }
  assert.equal(bassEvents(s, 'off', span).length, 0);
  for (const pat of ['soft', 'basic', 'four', 'half']) assert.ok(drumEvents(s, pat, span).some(e => e.kind === 'kick'), pat);
  const mel = melodyEvents(s, s.tracks.melody.notes, { lo: s.cycle, hi: 2 * s.cycle - 1e-6 });
  assert.equal(mel.length, 2); assert.ok(mel[1].d <= 0.5 * s.spb + 1e-9, 'a note that runs past the loop end is cut there');
});

test('MIDI export is a well-formed file with one track per audible part', () => {
  const s = songOf('C G Am F', p => { p.tracks.chords.instrument = 'softpiano'; p.tracks.bass.pattern = 'root'; p.tracks.drums.pattern = 'basic'; p.tracks.melody.notes = [{ t: 0, d: 2, m: 72 }]; });
  const b = songToMidi(s), txt = Buffer.from(b).toString('latin1');
  assert.equal(txt.slice(0, 4), 'MThd'); assert.equal(b[11], 6, 'tempo track + 5 parts'); assert.equal(txt.split('MTrk').length - 1, 6);
  const dv = new DataView(b.buffer); let o = 14, n = 0;
  while (o < b.length) { assert.equal(txt.slice(o, o + 4), 'MTrk'); o += 8 + dv.getUint32(o + 4); n++; }
  assert.equal(o, b.length); assert.equal(n, 6);
  assert.equal(encodeMidi({ bpm: 120, tracks: [] })[11], 1);
});

test('WAV export has a correct header and clips instead of wrapping', () => {
  const w = encodeWav([new Float32Array([0, 1, -1, 2]), new Float32Array([0, 0.5, -0.5, -2])], 48000), dv = new DataView(w.buffer);
  assert.equal(w.length, 44 + 16); assert.equal(dv.getUint32(24, true), 48000); assert.equal(dv.getUint16(22, true), 2);
  assert.equal(dv.getInt16(44 + 4, true), 32767); assert.equal(dv.getInt16(44 + 12, true), 32767); assert.equal(dv.getInt16(44 + 14, true), -32768);
});
