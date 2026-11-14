// "My projects": autosave of the open project on this device, and the sheet to switch, create, rename,
// duplicate, delete, import and export projects. The storage itself is in ../storage/projects.js.
import { h, ICON } from './dom.js';
import { openSheet, confirmDialog, promptDialog, toast } from './sheet.js';
import { pickTextFile, saveBlob } from './files.js';
import { createProjectStorage, summarize } from '../storage/projects.js';
import { setLimitNotice } from '../core/edit.js';
import { LIBRARY, KEY_NAMES, progressionSyms, keyString, surprise } from '../core/library.js';
import { newProject, exampleProject, EXAMPLES, normalizeProject, parseProjectFile, serializeProject, fileBase, newId, ProjectError } from '../core/project.js';

const SAVE_DELAY = 400;       // ms of quiet before an edit is written
const SAVING_SHOWN_AFTER = 300; // ms before "Saving…" is shown, so quick saves do not flicker
const MSG_PRIVATE = 'Private browsing: your work will not be kept after you close this tab. Use Export → Project file to save it.';

/** Short, friendly age of a time stamp. */
export function relativeTime(t, now = Date.now()) {
  if (!t) return 'at an unknown time';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const day = x => { const d = new Date(x); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };
  if (day(now) - day(t) === 1) return 'yesterday';
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Date(t).toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `base`, or `base 2`, `base 3`… when the name is taken. */
function freeName(base, names) {
  const taken = new Set(names.map(n => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
function untitledName(names) {
  const taken = new Set(names.map(n => n.toLowerCase()));
  let n = 1; while (taken.has(`untitled ${n}`)) n++;
  return `Untitled ${n}`;
}

const MSG_NEWER = 'Made with a newer version of the app. Reload the app to update it, then it opens.';
const MSG_DAMAGED = 'Damaged: its data on this device cannot be read, so it cannot be opened. You can delete it.';

export function initProjects(app) {
  const storage = createProjectStorage();
  app.storage = storage;
  const store = app.store;
  setLimitNotice(m => toast(m, { error: true }));
  const btn = document.getElementById('projBtn'), sub = document.getElementById('projSub');

  let started = false, touched = false, dirty = false, failing = false, saving = 0, showSaving = false, persistent = true;
  let conflicted = false, hasPending = false, writes = 0;
  /** @type {any} */ let conflictFor = null, conflictSheet = null;
  let timer = 0, savingTimer = 0, current = store.project;
  /** Projects read from storage: opening one of them needs no write, so another tab's view of it is not disturbed. */
  const fromStorage = new WeakSet();
  /** @type {Promise<any>} */ let queue = Promise.resolve();
  const enqueue = fn => { writes++; return (queue = queue.then(fn, fn).finally(() => { writes--; })); };
  /** A stored project, marked as read from storage. */
  async function getStored(id) { const p = await storage.get(id); if (p) fromStorage.add(p); return p; }
  const rememberLast = id => storage.setMeta('lastOpen', id).catch(() => {});

  // ------------------------------------------------------------ the small status line under the project name
  function renderSub() {
    if (!started || !sub) return;
    sub.textContent = conflicted ? 'Not saved · changed in another tab' : failing ? 'Not saved' : showSaving ? 'Saving…' : persistent ? 'My projects · saved' : 'My projects · this tab only';
  }

  // ------------------------------------------------------------ saving
  async function save(p, remember) {
    saving++;
    if (saving === 1) savingTimer = window.setTimeout(() => { showSaving = true; renderSub(); }, SAVING_SHOWN_AFTER);
    try {
      await storage.put(p);
      if (remember) await storage.setMeta('lastOpen', p.id);
      failing = false;
      if (hasPending) { hasPending = false; storage.clearPending(p.id); }
    } catch (e) {
      if (e && e.code === 'conflict') onConflict(p);
      else {
        if (!failing) toast(e && e.name === 'StorageError' ? e.message : 'Could not save on this device. Export your project to a file to keep it safe.', { error: true });
        failing = true;
        // a failed save is tried again in a few seconds
        dirty = true; clearTimeout(timer); timer = window.setTimeout(flush, 5000);
      }
    }
    if (--saving === 0) { clearTimeout(savingTimer); showSaving = false; }
    renderSub();
  }
  /** Write the pending edit now. Resolves when everything queued so far is written. */
  function flush() {
    clearTimeout(timer);
    if (dirty && !conflicted) { dirty = false; const p = store.project; enqueue(() => save(p, false)); }
    return queue;
  }
  function cancelPending() { clearTimeout(timer); dirty = false; }

  // ------------------------------------------------------------ another tab saved the project first
  /** The edit stays in memory; the person decides: keep it as a copy, or take the other tab's version. Nothing is dropped. */
  function onConflict(p) {
    conflicted = true; conflictFor = p; failing = true; clearTimeout(timer);
    askConflict();
  }
  /** Save a project as a new one next to the original, with a free name. Resolves with the copy. */
  async function saveAsCopy(p) {
    const taken = (await safeList()).map(x => x.name);
    const src = store.project.id === p.id ? store.project : p; // the edits made since the conflict are kept too
    const copy = normalizeProject(JSON.parse(JSON.stringify(src)));
    copy.id = newId(); copy.name = freeName(p.name.slice(0, 60) + ' (my changes)', taken);
    await storage.put(copy);
    fromStorage.add(copy);
    return copy;
  }
  function resolved() { conflicted = false; failing = false; conflictFor = null; hasPending = false; renderSub(); }
  function askConflict() {
    if (conflictSheet || !conflictFor) return;
    const p = conflictFor, isOpen = () => store.project.id === p.id;
    const mine = h('button', { class: 'big', type: 'button', id: 'conflictCopy', text: 'Keep mine as a copy', onClick: async () => {
      try {
        const copy = await saveAsCopy(p);
        resolved(); conflictSheet.close();
        if (isOpen()) { cancelPending(); store.open(copy); }
        toast(`Your changes are saved as “${copy.name}”. The other version was left as it is.`);
      } catch (e) { failToast(e, 'Could not save a copy.'); }
    } });
    const latest = h('button', { class: 'big ghost', type: 'button', id: 'conflictLatest', text: 'Use the other version', onClick: async () => {
      try {
        const other = await getStored(p.id);
        if (!other) {
          const copy = await saveAsCopy(p); resolved(); conflictSheet.close();
          if (isOpen()) { cancelPending(); store.open(copy); }
          toast(`The project was deleted in the other tab. Your changes are saved as “${copy.name}”.`); return;
        }
        resolved(); conflictSheet.close();
        if (isOpen()) { cancelPending(); store.open(other); }
        toast('Loaded the latest version. Your unsaved changes were dropped.');
      } catch (e) { failToast(e, 'Could not load the latest version.'); }
    } });
    const later = h('button', { class: 'big ghost', type: 'button', text: 'Decide later', onClick: () => conflictSheet.close() });
    conflictSheet = openSheet({ title: 'Changed in another tab', id: 'conflictSheet', kind: 'dialog', onClose: () => { conflictSheet = null; }, body: [
      h('p', { class: 'msg', text: `“${p.name}” was saved in another tab or window after you opened it here. Your changes are still here, but they are not saved. Keep them as a copy, or take the other version and drop them.` }),
      h('div', { class: 'btns' }, later, latest, mine)] });
  }

  store.subscribe(why => {
    const before = current; current = store.project;
    if (!started) { if (why.kind !== 'open') touched = true; return; }
    if (why.kind === 'open') {
      // an edit still waiting for its write belongs to the project that was just replaced
      if (before && before.id !== current.id) {
        const old = before;
        if (conflicted && conflictFor && conflictFor.id === old.id) { if (conflictSheet) conflictSheet.close(); const lost = conflictFor; resolved(); enqueue(async () => { try { const c = await saveAsCopy(lost); toast(`Your unsaved changes to “${lost.name}” are saved as “${c.name}”.`); } catch (e) { failToast(e, 'Could not keep your unsaved changes. Export the project next time.'); } }); }
        else if (dirty) enqueue(() => save(old, false));
      }
      cancelPending();
      const p = current;
      // a project that came from storage is already there: only remember which one is open
      if (fromStorage.has(p)) enqueue(() => rememberLast(p.id)); else enqueue(() => save(p, true));
    } else { dirty = true; clearTimeout(timer); if (!conflicted) timer = window.setTimeout(flush, SAVE_DELAY); renderSub(); }
  });

  /**
   * The page is going away or hidden: whatever is unsaved is handed over now, synchronously. The IndexedDB write is started inside this very call
   * (nothing awaited first), and the same project is put in localStorage, which is written at once; the next start puts it back if the write did not land.
   */
  function leave() {
    if (!started) { if (touched) { storage.savePending(store.project, false); hasPending = true; } return; }
    clearTimeout(timer);
    if (!(dirty || failing || conflicted || writes > 0)) return;
    const p = store.project;
    if (conflicted) { storage.savePending(p, true); hasPending = true; return; }
    storage.savePending(p, false); hasPending = true;
    dirty = false;
    const begun = storage.putNow(p, ok => {
      if (ok && store.project === p) { failing = false; storage.clearPending(p.id); hasPending = false; renderSub(); }
      else if (!ok) { dirty = true; clearTimeout(timer); timer = window.setTimeout(flush, 1000); }
    });
    // refused (another tab changed it, or no database): the edit waits in localStorage, marked so that the next start keeps it as a copy
    if (!begun && storage.persistent) storage.savePending(p, true);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  window.addEventListener('pagehide', leave);

  // ------------------------------------------------------------ start-up: restore the last project
  async function restore() {
    const r = await storage.ready();
    persistent = r.persistent;
    started = true;
    if (!persistent) toast(r.notice || MSG_PRIVATE, r.notice ? { error: true, ms: 12000 } : {});
    storage.onNotice(m => { persistent = false; failing = false; renderSub(); toast(m, { error: true, ms: 12000 }); });
    try {
      let rec = null;
      try { rec = await storage.recoverPending(); } catch (e) { /* the edit stays where it is */ }
      if (touched) { // the person already started editing the example
        const p = store.project; await save(p, true);
        if (rec) toast(rec.copy ? `Your last edit was kept as “${rec.project.name}” in My projects.` : `Your last edit to “${rec.project.name}” was restored. Find it in My projects.`);
        return;
      }
      let p = null;
      if (rec) { p = rec.project; fromStorage.add(p); }
      else {
        const last = await storage.getMeta('lastOpen');
        p = last ? await getStored(last) : null;
        // never an unreadable record, and the newest one by the date written in it
        if (!p) { const first = (await storage.list()).find(x => !x.unreadable); p = first ? await getStored(first.id) : null; }
      }
      if (p) { store.open(p); await queue; if (rec) toast(rec.copy ? `Your last edit was kept as “${p.name}”.` : 'Your last edit was restored.'); } else await save(store.project, true);
    } catch (e) { /* storage trouble must never break start-up: the open example stays usable */ }
    renderSub();
  }
  restore();

  // ------------------------------------------------------------ opening projects
  async function openProject(p) { await flush(); store.open(p); }
  const safeList = async () => { try { return await storage.list(); } catch (e) { toast('Could not read your saved projects on this device.', { error: true }); return []; } };
  async function names() { return (await safeList()).map(x => x.name); }
  /** Saved projects, with the open one taken from memory so it is always up to date. */
  async function listing() {
    await flush();
    const open = summarize(store.project);
    // readable projects by the time written in them, the ones that cannot be read last
    return (await safeList()).filter(x => x.id !== open.id).concat(open).sort((a, b) => (+!!a.unreadable - +!!b.unreadable) || b.updatedAt - a.updatedAt);
  }
  /** The stored document of a project (the open one comes from memory). */
  async function load(id) { return id === store.project.id ? store.project : getStored(id); }
  const failToast = (e, fallback) => toast(e && e.name === 'StorageError' ? e.message : fallback, { error: true });

  // ------------------------------------------------------------ the sheet
  function open() {
    if (conflicted) { askConflict(); return; }
    if (app.busy() || document.getElementById('projectsSheet')) return;
    const list = h('div', { class: 'pj-list stack', role: 'list', 'aria-label': 'Saved projects' });
    const sheet = openSheet({ title: 'My projects', id: 'projectsSheet', body: [], onClose: () => {} });
    const close = () => sheet.close();

    async function render(focusId) {
      const items = await listing();
      if (!document.contains(list) && !sheet.root.contains(list)) return;
      list.replaceChildren();
      if (!items.length) list.append(h('p', { class: 'empty', text: 'No saved projects yet. Create one above, or start from an example.' }));
      const openId = store.project.id;
      for (const it of items) list.append(row(it, it.id === openId));
      if (focusId) { const b = list.querySelector(`[data-more="${focusId}"]`); if (b) b.focus(); }
    }

    /** A record that cannot be read: shown with why, never opened, and it can be deleted. */
    function unreadableRow(it) {
      const acts = h('div', { class: 'pj-acts', id: 'pj-a-' + it.id, hidden: true },
        h('button', { class: 'small ghost danger', type: 'button', text: 'Delete', onClick: () => remove(it) }));
      const main = h('div', { class: 'ld pj-main', 'aria-disabled': 'true', 'data-unreadable': it.reason, onClick: () => openSaved(it, false) },
        h('span', { class: 'pj-text' }, h('b', { text: it.name }),
          h('small', { text: (it.reason === 'newer' ? MSG_NEWER : MSG_DAMAGED) + (it.updatedAt ? ` Edited ${relativeTime(it.updatedAt)}.` : '') })),
        h('span', { class: 'pj-tag', text: it.reason === 'newer' ? 'Newer version' : 'Damaged' }));
      const more = h('button', { class: 'icon ghost pj-more', type: 'button', html: ICON.more, 'aria-label': `Actions for ${it.name}`, 'aria-expanded': 'false', 'aria-controls': acts.id, 'data-more': it.id,
        onClick: () => { const on = acts.hidden; acts.hidden = !on; more.setAttribute('aria-expanded', String(on)); } });
      return h('div', { class: 'pj-item', role: 'listitem', 'data-unreadable': it.reason }, h('div', { class: 'pj-row' }, main, more), acts);
    }

    function row(it, isOpen) {
      if (it.unreadable) return unreadableRow(it);
      const acts = h('div', { class: 'pj-acts', id: 'pj-a-' + it.id, hidden: true },
        h('button', { class: 'small ghost', type: 'button', text: 'Rename', onClick: () => rename(it) }),
        h('button', { class: 'small ghost', type: 'button', text: 'Duplicate', onClick: () => duplicate(it) }),
        h('button', { class: 'small ghost', type: 'button', text: 'Export file', onClick: () => exportFile(it) }),
        h('button', { class: 'small ghost danger', type: 'button', text: 'Delete', onClick: () => remove(it) }));
      const main = h('button', { class: 'ld pj-main', type: 'button', 'aria-current': isOpen ? 'true' : null, onClick: () => openSaved(it, isOpen) },
        h('span', { class: 'pj-text' }, h('b', { text: it.name }),
          h('small', { text: `${it.chordCount} ${it.chordCount === 1 ? 'chord' : 'chords'} · ${Math.round(it.tempo)} BPM · edited ${relativeTime(it.updatedAt)}` })),
        isOpen ? h('span', { class: 'pj-tag', text: 'Open' }) : null);
      const more = h('button', { class: 'icon ghost pj-more', type: 'button', html: ICON.more, 'aria-label': `Actions for ${it.name}`, 'aria-expanded': 'false', 'aria-controls': acts.id, 'data-more': it.id,
        onClick: () => { const on = acts.hidden; acts.hidden = !on; more.setAttribute('aria-expanded', String(on)); } });
      return h('div', { class: 'pj-item', role: 'listitem' }, h('div', { class: 'pj-row' + (isOpen ? ' is-open' : '') }, main, more), acts);
    }

    async function openSaved(it, isOpen) {
      if (isOpen) { close(); return; }
      if (it.unreadable) { toast(it.reason === 'newer' ? 'This project was made with a newer version of the app. Reload the app to update it, then try again.' : 'This project cannot be opened: its data on this device is damaged. You can delete it from the list.', { error: true }); return; }
      const p = await load(it.id);
      if (!p) { toast('This project could not be opened: its data on this device is damaged. You can delete it from the list.', { error: true }); return; }
      await openProject(p); close();
    }

    async function rename(it) {
      const name = await promptDialog({ title: 'Rename project', label: 'Project name', value: it.name, confirm: 'Rename' });
      if (name === null || name === it.name) return;
      if (it.id === store.project.id) store.update(p => { p.name = name; }, 'name');
      else {
        const p = await storage.get(it.id);
        if (!p) { toast('This project could not be renamed: its data on this device is damaged.', { error: true }); return; }
        p.name = name; p.updatedAt = Date.now();
        try { await storage.put(p); } catch (e) { failToast(e, 'Could not rename this project.'); return; }
      }
      await render(it.id);
    }

    async function duplicate(it) {
      const src = await load(it.id);
      if (!src) { toast('This project could not be duplicated: its data on this device is damaged.', { error: true }); return; }
      const now = Date.now(), copy = normalizeProject(JSON.parse(JSON.stringify(src)));
      copy.id = newId(); copy.createdAt = copy.updatedAt = now;
      copy.name = freeName(src.name.slice(0, 70) + ' copy', await names());
      try { await storage.put(copy); } catch (e) { failToast(e, 'Could not duplicate this project.'); return; }
      toast(`Created “${copy.name}”.`);
      await render(copy.id);
    }

    async function exportFile(it) {
      const p = await load(it.id);
      if (!p) { toast('This project could not be exported: its data on this device is damaged.', { error: true }); return; }
      saveBlob(new Blob([serializeProject(p)], { type: 'application/json' }), `${fileBase(p)}.json`);
      toast(`Exporting “${p.name}” as ${fileBase(p)}.json.`);
    }

    async function remove(it) {
      const ok = await confirmDialog({ title: `Delete “${it.name}”?`, message: 'This project will be removed from this device. This cannot be undone.', confirm: 'Delete', danger: true });
      if (!ok) return;
      const wasOpen = it.id === store.project.id;
      if (wasOpen) cancelPending();
      await queue;
      try { await storage.remove(it.id); } catch (e) { failToast(e, 'Could not delete this project.'); return; }
      if (wasOpen) {
        const next = (await storage.list()).find(x => !x.unreadable), p = next ? await getStored(next.id) : null;
        store.open(p || newProject('Untitled'));
      }
      toast(`Deleted “${it.name}”.`);
      await render();
    }

    /** New project: blank, or one of the common progressions in a key. One tap on a progression makes a project with its chords. */
    async function create() {
      const taken = await names();
      let root = 0;
      const make = async (name, text, key) => {
        const p = newProject(freeName(name, taken) || untitledName(taken), text);
        if (key) p.key = key;
        await openProject(p); chooser.close(); close();
      };
      const keySel = h('select', { id: 'newKey', 'aria-label': 'Key', onChange: e => { root = +e.target.value; draw(); } }, KEY_NAMES.map((n, r) => h('option', { value: String(r), text: n + ' major / minor' })));
      const list = h('div', { class: 'stack', role: 'list', 'aria-label': 'Common progressions' });
      function draw() {
        list.replaceChildren(...LIBRARY.map(prog => {
          const syms = progressionSyms(prog, root);
          return h('button', { class: 'ld', type: 'button', role: 'listitem', 'data-prog': prog.id, onClick: () => make(prog.name, syms.join(' '), keyString(prog, root)) },
            h('span', null, h('b', { text: prog.name }), h('small', { text: syms.join('  ') + ' · ' + prog.mood })), h('i', { html: ICON.right }));
        }));
      }
      draw();
      const chooser = openSheet({ title: 'New project', id: 'newSheet', body: [
        h('div', { class: 'btns' },
          h('button', { class: 'big ghost', type: 'button', id: 'newBlank', text: 'Blank', onClick: () => make(untitledName(taken), '', '') }),
          h('button', { class: 'big pink', type: 'button', id: 'newSurprise', text: 'Surprise me', onClick: () => { const r = surprise(); make(r.prog.name, r.syms.join(' '), keyString(r.prog, r.root)); } })),
        h('div', null, h('label', { for: 'newKey', text: 'Start from a common progression, in the key of' }), keySel),
        list] });
    }

    async function importFile() {
      const f = await pickTextFile('.json,application/json');
      if (!f) return;
      if (f.tooBig) { toast(`“${f.name}” is too big to be a project file. Pick a file exported from this app.`, { error: true }); return; }
      let p; const notes = [];
      try { p = parseProjectFile(f.text, notes); } catch (e) {
        toast(`Could not import “${f.name}”. ${e instanceof ProjectError ? e.message : 'Pick a project file exported from this app.'}`, { error: true }); return;
      }
      const taken = (await names()).concat(store.project.name);
      p.id = newId(); p.updatedAt = Date.now();
      if (taken.some(n => n.toLowerCase() === p.name.toLowerCase())) p.name = p.name.slice(0, 68) + ' (imported)';
      await openProject(p); close();
      toast(`Imported “${p.name}”.${notes.length ? ' ' + notes.join(' ') : ''}`, notes.length ? { ms: 8000 } : {});
    }

    async function fromExample(i) {
      const p = exampleProject(i);
      p.name = freeName(p.name, await names());
      await openProject(p); close();
    }

    const examples = EXAMPLES.map((e, i) => h('button', { class: 'small ghost pj-example', type: 'button', text: e.name, onClick: () => fromExample(i) }));
    sheet.root.querySelector('.pbody').append(
      h('div', { class: 'btns' },
        h('button', { class: 'big', type: 'button', html: ICON.plus + '<span>New project</span>', onClick: create }),
        h('button', { class: 'big ghost', type: 'button', html: ICON.folder + '<span>Import file</span>', onClick: importFile })),
      h('section', null, h('div', { class: 'gh', text: 'Start from an example' }), h('div', { class: 'pj-examples' }, examples)),
      h('section', null, h('div', { class: 'gh', text: 'On this device' }), list));
    render();
  }

  btn.addEventListener('click', open);
}
