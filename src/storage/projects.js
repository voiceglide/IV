// Local storage of projects on this device (IndexedDB). No DOM, no network, nothing but the person's own projects.
// When IndexedDB is missing or refuses to open (private browsing, blocked), the same API runs in memory:
// the app stays usable, `persistent` is false, and nothing survives a reload.
import { normalizeProject, ProjectError } from '../core/project.js';

/**
 * @typedef {import('../core/project.js').Project} Project
 * @typedef {{id:string, name:string, updatedAt:number, createdAt:number, chordCount:number, tempo:number, unreadable?:boolean, reason?:'newer'|'damaged'}} ProjectSummary
 * An unreadable record is listed (so it can be deleted) with `unreadable` set; `reason` says whether it comes from a newer app version.
 */

export const DB_NAME = 'studio';
export const DB_VERSION = 1;
const CHANNEL = 'studio-projects';

/** A failed write, with a message written for the person using the app. */
export class StorageError extends Error {
  /** @param {string} message @param {'quota'|'write'|'read'|'conflict'} code */
  constructor(message, code) { super(message); this.name = 'StorageError'; this.code = code; }
}
const MSG_QUOTA = "This device's storage is full. Export your project to a file to keep it safe, then delete projects you no longer need.";
const MSG_READ = 'Could not read your projects from this device. Nothing was changed. Reload the app and try again.';
const MSG_CONFLICT = 'This project was changed in another tab or window, so this save was not made to keep that work. Reload the project to see the latest version, or export yours to a file.';
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
const revOf = raw => (raw && Number.isInteger(raw.rev) && raw.rev > 0 ? raw.rev : 0);
/** A stored record that cannot be read as a project, shown so that it can be deleted. @returns {ProjectSummary} */
function unreadableSummary(raw) {
  let reason = /** @type {'newer'|'damaged'} */('damaged');
  try { normalizeProject(raw); } catch (e) { if (e instanceof ProjectError && /newer version/.test(e.message)) reason = 'newer'; }
  const name = raw && typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Unreadable project';
  return { id: String(raw.id), name, updatedAt: 0, createdAt: 0, chordCount: 0, tempo: 0, unreadable: true, reason };
}
/** @param {Project} p @returns {ProjectSummary} */
export function summarize(p) { return { id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, chordCount: p.chords.length, tempo: p.tempo }; }
/** @param {any[]} records @returns {ProjectSummary[]} */
function summaries(records) {
  const good = [], bad = [];
  for (const raw of records) { const p = readable(raw); if (p) good.push(summarize(p)); else if (raw && raw.id !== undefined) bad.push(unreadableSummary(raw)); }
  return good.sort((a, b) => b.updatedAt - a.updatedAt).concat(bad);
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

/** Open the database. `onLost` runs when the browser closes it under us (another tab upgrading, or an abnormal close). @returns {Promise<IDBDatabase|null>} */
function openDb(idb, onLost) {
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
        const lost = () => { try { db.close(); } catch (e) { /* already closed */ } onLost(db); };
        db.onversionchange = lost; db.onclose = lost;
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

/**
 * @param {IDBFactory} [idbFactory]
 * @param {{navigator?: any, channel?: boolean}} [env]  test seams: the navigator that may grant persistence, and `channel:false` to skip BroadcastChannel
 */
export function createProjectStorage(idbFactory = /** @type {any} */(globalThis).indexedDB, env = {}) {
  /** @type {IDBDatabase|null} */ let db = null;
  let persistent = false, everOpened = false, memoryOnly = false;
  const mem = { projects: new Map(), meta: new Map() };
  /** @type {Promise<{persistent:boolean}>|null} */ let opening = null;
  /** The revision of each project as this tab last read or wrote it: a save over a newer one is a conflict. @type {Map<string, number>} */
  const known = new Map();
  /** @type {Set<(c:{id:string, rev:number, removed:boolean})=>void>} */ const listeners = new Set();
  const nav = 'navigator' in env ? env.navigator : /** @type {any} */(globalThis).navigator;

  /** @type {any} */ let channel = null;
  if (env.channel !== false && typeof /** @type {any} */(globalThis).BroadcastChannel === 'function') {
    try {
      channel = new /** @type {any} */(globalThis).BroadcastChannel(CHANNEL);
      if (typeof channel.unref === 'function') channel.unref();
      channel.onmessage = ev => {
        const m = ev && ev.data;
        if (m && typeof m.id === 'string') for (const fn of listeners) { try { fn({ id: m.id, rev: +m.rev || 0, removed: !!m.removed }); } catch (e) { /* a listener must not break the others */ } }
      };
    } catch (e) { channel = null; }
  }
  const announce = (id, rev, removed) => { try { if (channel) channel.postMessage({ id, rev, removed }); } catch (e) { /* closed channel */ } };

  function ready() {
    if (db || memoryOnly) return Promise.resolve({ persistent });
    // not cached for ever: after the connection was lost, the next call opens a new one
    if (!opening) opening = openDb(idbFactory, lostDb => { if (db === lostDb) db = null; }).then(d => {
      opening = null;
      if (d) {
        db = d; persistent = true; everOpened = true;
        try { const st = nav && nav.storage; if (st && typeof st.persist === 'function') Promise.resolve(st.persist()).catch(() => {}); } catch (e) { /* optional */ }
      } else if (!everOpened) { memoryOnly = true; persistent = false; }
      return { persistent };
    });
    return opening;
  }
  /** The open database, or null in memory mode. A database that was open and cannot be reopened is an error, not a silent switch to memory. */
  async function conn(code = /** @type {'read'|'write'} */('write')) {
    await ready();
    if (memoryOnly) return null;
    if (!db) throw new StorageError(code === 'read' ? MSG_READ : MSG_WRITE, code);
    return db;
  }
  const readError = e => (e instanceof StorageError ? e : new StorageError(MSG_READ, 'read'));

  /** Write a project in one transaction, refusing when another tab saved a newer revision since this tab read it. */
  function putChecked(d, project, force) {
    return new Promise((resolve, reject) => {
      let rev = 0, conflict = false, failure = null;
      try {
        const tx = d.transaction('projects', 'readwrite');
        tx.oncomplete = () => resolve(rev);
        tx.onerror = ev => reject((ev && ev.target && /** @type {any} */(ev.target).error) || tx.error || new Error('transaction failed'));
        tx.onabort = () => reject(conflict ? new StorageError(MSG_CONFLICT, 'conflict') : failure || tx.error || new Error('transaction aborted'));
        const store = tx.objectStore('projects'), g = store.get(project.id);
        g.onsuccess = () => {
          try {
            const cur = g.result === undefined ? null : revOf(g.result);
            if (!force && cur !== null && known.has(project.id) && known.get(project.id) !== cur) { conflict = true; tx.abort(); return; }
            rev = (cur || 0) + 1;
            store.put({ ...project, rev });
          } catch (e) { failure = e; try { tx.abort(); } catch (e2) { reject(e); } }
        };
      } catch (e) { reject(e); }
    });
  }

  return {
    get persistent() { return persistent; },
    ready,
    /** Called when another tab or window saves or deletes a project. Returns a function that stops listening. @param {(c:{id:string, rev:number, removed:boolean})=>void} fn */
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Close the connection and the channel (tests, or when the app shuts down). */
    close() { try { if (channel) channel.close(); } catch (e) { /* ignore */ } channel = null; const d = db; db = null; if (d) { try { d.close(); } catch (e) { /* ignore */ } } },
    /** All projects, newest first, then the records that cannot be read. Rejects with a StorageError when the device cannot be read. @returns {Promise<ProjectSummary[]>} */
    async list() {
      let d; try { d = await conn('read'); } catch (e) { throw readError(e); }
      if (!d) return summaries(Array.from(mem.projects.values()));
      try { return summaries(await run(d, 'projects', 'readonly', s => s.getAll())); } catch (e) { throw readError(e); }
    },
    /** null when there is no such project or it cannot be read as one; rejects when the device cannot be read. @param {string} id @returns {Promise<Project|null>} */
    async get(id) {
      let d, raw;
      try {
        d = await conn('read');
        raw = d ? await run(d, 'projects', 'readonly', s => s.get(id)) : mem.projects.get(id);
      } catch (e) { throw readError(e); }
      if (raw === undefined) return null;
      const p = readable(clone(raw));
      if (p) known.set(id, revOf(raw));
      return p;
    },
    /**
     * Save a project. Rejects with a StorageError of code 'conflict' when another tab saved this project after this tab last read it;
     * pass `{force:true}` to overwrite anyway. Resolves with the new revision.
     * @param {Project} project @param {{force?:boolean}} [opts]
     */
    async put(project, opts = {}) {
      try {
        if (!project || typeof project.id !== 'string' || !project.id) throw new Error('missing id');
        const d = await conn('write');
        let rev;
        if (!d) {
          const ex = mem.projects.get(project.id), cur = ex === undefined ? null : revOf(ex);
          if (!opts.force && cur !== null && known.has(project.id) && known.get(project.id) !== cur) throw new StorageError(MSG_CONFLICT, 'conflict');
          rev = (cur || 0) + 1; mem.projects.set(project.id, { ...clone(project), rev });
        } else rev = await putChecked(d, project, !!opts.force);
        known.set(project.id, rev); announce(project.id, rev, false);
        return rev;
      } catch (e) { throw toStorageError(e); }
    },
    /** @param {string} id */
    async remove(id) {
      const d = await conn('write').catch(e => { throw toStorageError(e); });
      if (!d) mem.projects.delete(id);
      else { try { await run(d, 'projects', 'readwrite', s => s.delete(id)); } catch (e) { throw toStorageError(e); } }
      known.delete(id); announce(id, 0, true);
    },
    /** @param {string} key @returns {Promise<any>} */
    async getMeta(key) {
      let d; try { d = await conn('read'); } catch (e) { throw readError(e); }
      if (!d) return mem.meta.has(key) ? clone(mem.meta.get(key)) : undefined;
      try { return await run(d, 'meta', 'readonly', s => s.get(key)); } catch (e) { throw readError(e); }
    },
    /** @param {string} key @param {any} value */
    async setMeta(key, value) {
      const d = await conn('write').catch(e => { throw toStorageError(e); });
      if (!d) { mem.meta.set(key, clone(value)); return; }
      try { await run(d, 'meta', 'readwrite', s => s.put(value, key)); } catch (e) { throw toStorageError(e); }
    },
  };
}
