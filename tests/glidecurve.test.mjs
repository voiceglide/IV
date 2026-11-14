import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../src/core/project.js';
import { buildSong, glideCurve, pitchAt, slotPitch, curveShape } from '../src/core/song.js';

const songOf = (curve) => { const p = newProject('t', 'C F G C'); p.glideStyle.curve = curve; return buildSong(p).song; };

test('curve shapes start at 0, end at 1 and never leave [0, 1]', () => {
  for (const c of ['straight', 'eased', 'scoop']) {
    assert.equal(curveShape(c, 0), 0); assert.equal(curveShape(c, 1), 1);
    for (let u = 0; u <= 1; u += 0.05) { const e = curveShape(c, u); assert.ok(e >= 0 && e <= 1); }
  }
  assert.equal(curveShape('straight', 0.3), 0.3);
  assert.ok(curveShape('scoop', 0.5) < 0.25, 'scoop lingers, then swoops late');
});

test('glideCurve is the one curve: pitchAt = chord note + glideCurve, and it honours the style', () => {
  for (const c of ['straight', 'eased', 'scoop']) {
    const s = songOf(c), i = s.n + 1, k = [0, 1, 2, 3].find(x => slotPitch(s, i, x) !== slotPitch(s, i + 1, x));
    const g = s.starts[i + 1] - s.glide / 2, d = slotPitch(s, i + 1, k) - slotPitch(s, i, k);
    assert.ok(Math.abs(glideCurve(s, k, g) - d * curveShape(c, 0.5)) < 1e-9);
    assert.ok(Math.abs(pitchAt(s, k, g) - (slotPitch(s, i, k) + glideCurve(s, k, g))) < 1e-9);
    assert.equal(glideCurve(s, k, s.starts[i] + 0.01), 0);
  }
});
