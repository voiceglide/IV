// Foundations round, storage: a database that never answers, a newer app's database, unreadable records, the synchronous write, kept edits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createProjectStorage } from '../src/storage/projects.js';
import { newProject } from '../src/core/project.js';

const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), has: k => m.has(k) }; };
const putRaw = (idb, raw) => new Promise((res, rej) => {
  const open = idb.open('studio', 1);
  open.onupgradeneeded = () => { open.result.createObjectStore('projects', { keyPath: 'id' }); open.result.createObjectStore('meta'); };
  open.onsuccess = () => { const tx = open.result.transaction('projects', 'readwrite'); tx.objectStore('projects').put(raw); tx.oncomplete = () => { open.result.close(); res(); }; tx.onerror = rej; };
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('a database that never answers falls back to memory with a notice', async () => {
  const idb = /** @type {any} */({ open: () => ({}) }); // a request that never fires
  const s = createProjectStorage(idb, { openTimeout: 40, channel: false });
  const t0 = Date.now(), r = await s.ready();
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(r.persistent, false); assert.match(String(r.notice), /not answering/);
  const p = newProject('Mem'); await s.put(p);
  assert.equal((await s.get(p.id)).name, 'Mem');
});

test('a database from a newer app version means memory mode with a clear message, also when it is found later', async () => {
  const idb = new IDBFactory();
  await new Promise((res, rej) => { const o = idb.open('studio', 2); o.onupgradeneeded = () => {}; o.onsuccess = () => { o.result.close(); res(); }; o.onerror = rej; });
  const s = createProjectStorage(idb, { channel: false });
  const r = await s.ready();
  assert.equal(r.persistent, false); assert.match(String(r.notice), /newer version of the app/);
  await s.put(newProject('Kept in the tab'));
  // found later: the connection is lost (another tab upgraded), the reopen is refused as too old
  const idb2 = new IDBFactory(), s2 = createProjectStorage(idb2, { channel: false }), heard = [];
  s2.onNotice(m => heard.push(m));
  await s2.put(newProject('Before'));
  await new Promise((res, rej) => { const d = idb2.deleteDatabase('studio'); d.onsuccess = res; d.onerror = rej; });
  await new Promise((res, rej) => { const o = idb2.open('studio', 2); o.onsuccess = () => { o.result.close(); res(); }; o.onerror = rej; });
  await s2.put(newProject('After')); // does not throw, does not leave the tab stuck
  assert.equal(heard.length, 1); assert.match(heard[0], /newer version/); assert.equal(s2.persistent, false);
  s.close(); s2.close();
});

test('unreadable records are listed as such, with their own date, and never sort first', async () => {
  const idb = new IDBFactory(), s = createProjectStorage(idb, { channel: false });
  const good = newProject('Good'); good.updatedAt = 1000; await s.put(good);
  await putRaw(idb, { id: 'future', version: 99, name: 'From later', updatedAt: 9000 });
  await putRaw(idb, { id: 'broken', name: 'Broken' });
  await putRaw(idb, { id: 'nodate', format: 'chord-project', version: 4, name: 'No date', chords: [{ sym: 'C' }] });
  const l = await s.list();
  assert.deepEqual(l.map(x => x.id), [good.id, 'nodate', 'future', 'broken']);
  const by = Object.fromEntries(l.map(x => [x.id, x]));
  assert.equal(by.future.unreadable, true); assert.equal(by.future.reason, 'newer'); assert.equal(by.future.updatedAt, 9000); assert.equal(by.future.name, 'From later');
  assert.equal(by.broken.unreadable, true); assert.equal(by.broken.reason, 'damaged'); assert.equal(by.broken.updatedAt, 0);
  assert.equal(by.nodate.unreadable, undefined); assert.equal(by.nodate.updatedAt, 0);
  assert.equal(await s.get('future'), null);
  s.close();
});

test('putNow starts the write inside the call, without waiting for anything', async () => {
  const idb = new IDBFactory(), calls = [];
  const open = idb.open.bind(idb);
  idb.open = (...a) => { const req = open(...a); req.addEventListener('success', () => { const d = req.result, t = d.transaction.bind(d); d.transaction = (...x) => { calls.push(x[1]); return t(...x); }; }); return req; };
  const s = createProjectStorage(idb, { channel: false }), p = newProject('Sync');
  await s.put(p);
  const before = calls.length;
  assert.equal(s.putNow({ ...p, tempo: 201 }), true);
  assert.equal(calls.length, before + 1); assert.equal(calls[calls.length - 1], 'readwrite');
  await sleep(30);
  assert.equal((await s.get(p.id)).tempo, 201);
  assert.equal(await s.put({ ...p, tempo: 202 }), 3);           // this tab's own quick write is not a conflict
  s.close();
});

test('putNow refuses a project another tab changed; nothing is overwritten', async () => {
  const idb = new IDBFactory(), a = createProjectStorage(idb), b = createProjectStorage(idb), p = newProject('Both');
  await a.put(p); await b.get(p.id);
  await b.put({ ...p, name: 'B was here' });
  await sleep(60);
  assert.equal(a.putNow({ ...p, name: 'A late' }), false);
  assert.equal((await a.get(p.id)).name, 'B was here');
  a.close(); b.close();
});

test('an edit kept in localStorage comes back at the next start', async () => {
  const idb = new IDBFactory(), ls = memStore();
  const first = createProjectStorage(idb, { channel: false, localStorage: ls }), p = newProject('Pend'); p.updatedAt = 1000;
  await first.put(p);
  assert.equal(first.savePending({ ...p, tempo: 201, updatedAt: 2000 }), true); first.close();
  const next = createProjectStorage(idb, { channel: false, localStorage: ls });
  const rec = await next.recoverPending();
  assert.ok(rec); assert.equal(rec.copy, false); assert.equal(rec.project.tempo, 201);
  assert.equal((await next.get(p.id)).tempo, 201); assert.equal(ls.has('studio.pending'), false);
  assert.equal(await next.recoverPending(), null);
  // the write did land: nothing to do
  next.savePending(/** @type {any} */(await next.get(p.id)));
  assert.equal(await next.recoverPending(), null);
  // a newer stored version, or an edit refused as a conflict: kept as a copy
  next.savePending({ ...p, tempo: 77, updatedAt: 1500 });
  const copy = await next.recoverPending();
  assert.ok(copy); assert.equal(copy.copy, true); assert.match(copy.project.name, /recovered/); assert.notEqual(copy.project.id, p.id); assert.equal(copy.project.tempo, 77);
  assert.equal((await next.get(p.id)).tempo, 201);
  next.savePending({ ...p, tempo: 55, updatedAt: 99999 }, true);
  assert.equal((await next.recoverPending())?.copy, true);
  assert.equal((await next.get(p.id)).tempo, 201);
  // a deleted project is not brought back by an old pending edit
  next.savePending({ ...p, updatedAt: 3000 }); await next.remove(p.id);
  assert.equal(await next.recoverPending(), null);
  // an unreadable record of the same id is never overwritten
  await putRaw(idb, { id: 'future', version: 99, name: 'Later' });
  next.savePending({ ...p, id: 'future', updatedAt: 5000 });
  assert.equal((await next.recoverPending())?.copy, true);
  assert.equal((await next.list()).find(x => x.id === 'future')?.unreadable, true);
  next.close();
});
