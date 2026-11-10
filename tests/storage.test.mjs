import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createProjectStorage, StorageError } from '../src/storage/projects.js';
import { newProject, exampleProject } from '../src/core/project.js';

const make = () => createProjectStorage(new IDBFactory());
const at = (name, updatedAt, chords = 'C G Am F') => { const p = newProject(name, chords); p.updatedAt = updatedAt; return p; };

test('a project survives a save / read round trip', async () => {
  const s = make(), p = exampleProject(1);
  assert.deepEqual(await s.ready(), { persistent: true });
  assert.equal(s.persistent, true);
  await s.put(p);
  assert.deepEqual(await s.get(p.id), p);
  assert.equal(await s.get('nope'), null);
});

test('list gives summaries, most recently edited first', async () => {
  const s = make();
  const a = at('A', 1000), b = at('B', 3000, 'C G'), c = at('C', 2000);
  for (const p of [a, b, c]) await s.put(p);
  const l = await s.list();
  assert.deepEqual(l.map(x => x.name), ['B', 'C', 'A']);
  assert.equal(l[0].chordCount, 2); assert.equal(l[0].tempo, 90); assert.equal(l[0].id, b.id);
  assert.equal(l[0].updatedAt, 3000); assert.equal(typeof l[0].createdAt, 'number');
  assert.equal(Object.keys(l[0]).sort().join(), 'chordCount,createdAt,id,name,tempo,updatedAt');
  await s.put({ ...a, name: 'A2', updatedAt: 9000 });
  assert.deepEqual((await s.list()).map(x => x.name), ['A2', 'B', 'C']);
});

test('a stored version 1 record is migrated when read', async () => {
  const idb = new IDBFactory(), s = createProjectStorage(idb);
  await s.ready();
  const raw = { id: 'old1', version: 1, name: 'Old', prog: 'C F G', bpm: 100 };
  await new Promise((res, rej) => {
    const open = idb.open('studio', 1);
    open.onsuccess = () => { const tx = open.result.transaction('projects', 'readwrite'); tx.objectStore('projects').put(raw); tx.oncomplete = res; tx.onerror = rej; };
  });
  const p = await s.get('old1');
  assert.equal(p.version, 2); assert.equal(p.id, 'old1'); assert.equal(p.name, 'Old');
  assert.equal(p.chords.length, 3); assert.equal(p.tempo, 100);
  assert.equal((await s.list())[0].chordCount, 3);
});

test('a corrupt record reads as null and does not break the list', async () => {
  const idb = new IDBFactory(), s = createProjectStorage(idb);
  await s.ready(); await s.put(newProject('Good'));
  await new Promise((res, rej) => {
    const open = idb.open('studio', 1);
    open.onsuccess = () => { const tx = open.result.transaction('projects', 'readwrite'); const st = tx.objectStore('projects'); st.put({ id: 'bad', hello: 1 }); st.put({ id: 'newer', format: 'chord-project', version: 99 }); tx.oncomplete = res; tx.onerror = rej; };
  });
  assert.equal(await s.get('bad'), null);
  assert.equal(await s.get('newer'), null);
  assert.deepEqual((await s.list()).map(x => x.name), ['Good']);
});

test('remove deletes one project', async () => {
  const s = make(), a = newProject('A'), b = newProject('B');
  await s.put(a); await s.put(b);
  await s.remove(a.id); await s.remove('missing');
  assert.equal(await s.get(a.id), null);
  assert.deepEqual((await s.list()).map(x => x.id), [b.id]);
});

test('meta stores small values by key', async () => {
  const s = make();
  assert.equal(await s.getMeta('lastOpen'), undefined);
  await s.setMeta('lastOpen', 'abc'); await s.setMeta('flag', { seen: true });
  assert.equal(await s.getMeta('lastOpen'), 'abc');
  assert.deepEqual(await s.getMeta('flag'), { seen: true });
  await s.setMeta('lastOpen', 'def');
  assert.equal(await s.getMeta('lastOpen'), 'def');
});

test('data persists across two storage objects on the same database', async () => {
  const idb = new IDBFactory(), p = newProject('Kept');
  await createProjectStorage(idb).put(p);
  assert.equal((await createProjectStorage(idb).get(p.id)).name, 'Kept');
});

async function checkMemory(s) {
  assert.deepEqual(await s.ready(), { persistent: false });
  assert.equal(s.persistent, false);
  const a = at('A', 1), b = at('B', 2);
  await s.put(a); await s.put(b); await s.setMeta('lastOpen', b.id);
  assert.deepEqual((await s.list()).map(x => x.name), ['B', 'A']);
  assert.deepEqual(await s.get(a.id), a);
  assert.equal(await s.getMeta('lastOpen'), b.id);
  await s.remove(a.id);
  assert.equal(await s.get(a.id), null);
}
test('without IndexedDB the same API runs in memory', async () => { await checkMemory(createProjectStorage(/** @type {any} */(null))); });
test('with an undefined factory the API runs in memory', async () => {
  const saved = globalThis.indexedDB; delete globalThis.indexedDB;
  try { await checkMemory(createProjectStorage()); } finally { if (saved) globalThis.indexedDB = saved; }
});
test('when opening throws or fails, the API runs in memory and never throws', async () => {
  await checkMemory(createProjectStorage(/** @type {any} */({ open() { throw new DOMException('denied', 'SecurityError'); } })));
  await checkMemory(createProjectStorage(/** @type {any} */({ open() { const r = {}; setTimeout(() => r.onerror && r.onerror(), 0); return r; } })));
  await checkMemory(createProjectStorage(/** @type {any} */({ open() { const r = {}; setTimeout(() => r.onblocked && r.onblocked(), 0); return r; } })));
});

/** A factory whose database fails every write with the given error. */
function failing(makeError) {
  const real = new IDBFactory();
  return {
    open(...args) {
      const req = real.open(...args), wrapped = {};
      Object.defineProperty(wrapped, 'result', { get: () => new Proxy(req.result, { get(t, k) {
        if (k === 'transaction') return (...a) => {
          const tx = t.transaction(...a);
          return new Proxy(tx, {
            get(tt, kk) {
              if (kk === 'objectStore') return name => new Proxy(tt.objectStore(name), { get(ss, m) {
                if (m === 'put') return () => { throw makeError(); };
                const v = ss[m]; return typeof v === 'function' ? v.bind(ss) : v;
              } });
              const v = tt[kk]; return typeof v === 'function' ? v.bind(tt) : v;
            },
            set(tt, kk, v) { tt[kk] = v; return true; },
          });
        };
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      } }) });
      Object.defineProperty(wrapped, 'error', { get: () => req.error });
      for (const ev of ['onupgradeneeded', 'onsuccess', 'onerror', 'onblocked']) Object.defineProperty(wrapped, ev, { set: fn => { req[ev] = e => fn(e); } });
      return wrapped;
    },
  };
}

test('a full device maps to a StorageError with code quota', async () => {
  const s = createProjectStorage(/** @type {any} */(failing(() => new DOMException('full', 'QuotaExceededError'))));
  assert.equal((await s.ready()).persistent, true);
  await assert.rejects(s.put(newProject('X')), e => {
    assert.ok(e instanceof StorageError); assert.equal(e.code, 'quota');
    assert.equal(e.message, "This device's storage is full. Export your project to a file to keep it safe, then delete projects you no longer need.");
    return true;
  });
});

test('any other write failure maps to a StorageError with code write', async () => {
  const s = createProjectStorage(/** @type {any} */(failing(() => new DOMException('nope', 'UnknownError'))));
  await assert.rejects(s.put(newProject('X')), e => {
    assert.ok(e instanceof StorageError); assert.equal(e.code, 'write');
    assert.equal(e.message, 'Could not save on this device. Export your project to a file to keep it safe.');
    return true;
  });
});

test('a project without an id is refused with a StorageError', async () => {
  await assert.rejects(make().put(/** @type {any} */({ name: 'x' })), e => e instanceof StorageError && e.code === 'write');
});
