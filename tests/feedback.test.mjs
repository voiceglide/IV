import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackPayload, messageOk } from '../src/core/feedback.js';
import { newProject } from '../src/core/project.js';

test('payload without the project has exactly four keys', () => {
  const p = buildFeedbackPayload({ kind: 'idea', message: '  hello there ', attach: false, project: newProject('x', 'C G'), appName: 'App' });
  assert.deepEqual(Object.keys(p).sort(), ['app', 'kind', 'message', 'version']);
  assert.equal(p.message, 'hello there'); assert.equal(p.kind, 'idea'); assert.equal(p.version, 1); assert.equal(p.app, 'App');
});

test('attached project loses id, name and dates but keeps the music', () => {
  const proj = newProject('Secret name', 'C G Am F');
  const p = buildFeedbackPayload({ kind: 'chord', message: 'abc', attach: true, project: proj, appName: 'App' });
  assert.ok(p.project);
  for (const k of ['id', 'name', 'createdAt', 'updatedAt']) assert.ok(!(k in p.project), k);
  assert.equal(p.project.chords.length, 4); assert.equal(p.project.tempo, proj.tempo);
  assert.ok(proj.id && proj.name, 'the original is not changed');
  assert.ok(!JSON.stringify(p).includes('Secret name'));
});

test('unknown kind falls back to bug, long text is cut, no project key when not attached', () => {
  const p = buildFeedbackPayload({ kind: 'x', message: 'a'.repeat(3000), attach: false, project: newProject('x', 'C'), appName: 'A' });
  assert.equal(p.kind, 'bug'); assert.equal(p.message.length, 2000); assert.ok(!('project' in p));
});

test('messageOk needs 3 non-space characters', () => {
  assert.equal(messageOk('  a b  '), false); assert.equal(messageOk(' abc '), true); assert.equal(messageOk(''), false);
});
