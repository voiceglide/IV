// Local storage of projects on this device (IndexedDB). No DOM, no network, nothing but the person's own projects.
// When IndexedDB is missing or refuses to open (private browsing, blocked), the same API runs in memory:
// the app stays usable, `persistent` is false, and nothing survives a reload.
import { normalizeProject } from '../core/project.js';

/**
 * @typedef {import('../core/project.js').Project} Project
 * @typedef {{id:string, name:string, updatedAt:number, createdAt:number, chordCount:number, tempo:number}} ProjectSummary
 */

export const DB_NAME = 'studio';
export const DB_VERSION = 1;

/** A failed write, with a message written for the person using the app. */
export class StorageError extends Error {
  /** @param {string} message @param {'quota'|'write'} code */
  constructor(message, code) { super(message); this.name = 'StorageError'; this.code = code; }
}
const MSG_QUOTA = "This device's storage is full. Export your project to a file to keep it safe, then delete projects you no longer need.";
const MSG_WRITE = 'Could not save on this device. Export your project to a file to keep it safe.';

/** @param {any} e */
function toStorageError(e) {
  if (e instanceof StorageError) return e;
  const name = e && e.name, msg = e && e.message;
  const quota = name === 'QuotaExceededError' || (typeof msg === 'string' && /quota/i.test(msg)) || (e && e.code === 22);
  return quota ? new StorageError(MSG_QUOTA, 'quota') : new StorageError(MSG_WRITE, 'write');
}

const clone = x => JSON.parse(JSON.stringify(x));

/** @param {any} raw @returns {Project|null} */
function readable(raw) { try { return normalizeProject(raw); } catch (e) { return null; } }
/** @param {Project} p @returns {ProjectSummary} */
export function summarize(p) { return { id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, chordCount: p.chords.length, tempo: p.tempo }; }
/** @param {any[]} records @returns {ProjectSummary[]} */
function summaries(records) {
  return records.map(readable).filter(Boolean).map(p => summarize(/** @type {Project} */(p))).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Run one transaction; resolves with the request's result once the transaction has committed. */
function run(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    let result;
    try {
      const tx = db.transaction(store, mode);
      tx.oncomplete = () => resolve(result);
      tx.onerror = ev => reject((ev && ev.target && /** @type {any} */(ev.target).error) || tx.error || new Error('transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
      const req = fn(tx.objectStore(store));
      if (req) req.onsuccess = () => { result = req.result; };
    } catch (e) { reject(e); }
  });
}

/** @param {IDBFactory|undefined} idb @returns {Promise<IDBDatabase|null>} */
function openDb(idb) {
  return new Promise(resolve => {
    if (!idb || typeof idb.open !== 'function') { resolve(null); return; }
    try {
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

/**
 * @param {IDBFactory} [idbFactory]
 */
export function createProjectStorage(idbFactory = /** @type {any} */(globalThis).indexedDB) {
  /** @type {IDBDatabase|null} */ let db = null;
  let persistent = false;
  const mem = { projects: new Map(), meta: new Map() };
  /** @type {Promise<{persistent:boolean}>|null} */ let opening = null;

  function ready() {
    if (!opening) opening = openDb(idbFactory).then(d => { db = d; persistent = !!d; return { persistent }; }, () => ({ persistent: false }));
    return opening;
  }

  return {
    get persistent() { return persistent; },
    ready,
    /** @returns {Promise<ProjectSummary[]>} */
    async list() {
      await ready();
      if (!db) return summaries(Array.from(mem.projects.values()));
      try { return summaries(await run(db, 'projects', 'readonly', s => s.getAll())); } catch (e) { return []; }
    },
    /** @param {string} id @returns {Promise<Project|null>} */
    async get(id) {
      await ready();
      let raw;
      if (!db) raw = mem.projects.get(id);
      else { try { raw = await run(db, 'projects', 'readonly', s => s.get(id)); } catch (e) { return null; } }
      return raw === undefined ? null : readable(clone(raw));
    },
    /** @param {Project} project */
    async put(project) {
      await ready();
      try {
        if (!project || typeof project.id !== 'string' || !project.id) throw new Error('missing id');
        if (!db) { mem.projects.set(project.id, clone(project)); return; }
        await run(db, 'projects', 'readwrite', s => s.put(project));
      } catch (e) { throw toStorageError(e); }
    },
    /** @param {string} id */
    async remove(id) {
      await ready();
      if (!db) { mem.projects.delete(id); return; }
      try { await run(db, 'projects', 'readwrite', s => s.delete(id)); } catch (e) { throw toStorageError(e); }
    },
    /** @param {string} key @returns {Promise<any>} */
    async getMeta(key) {
      await ready();
      if (!db) return mem.meta.has(key) ? clone(mem.meta.get(key)) : undefined;
      try { return await run(db, 'meta', 'readonly', s => s.get(key)); } catch (e) { return undefined; }
    },
    /** @param {string} key @param {any} value */
    async setMeta(key, value) {
      await ready();
      if (!db) { mem.meta.set(key, clone(value)); return; }
      try { await run(db, 'meta', 'readwrite', s => s.put(value, key)); } catch (e) { throw toStorageError(e); }
    },
  };
}
