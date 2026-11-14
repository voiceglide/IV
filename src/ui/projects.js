// "My projects": autosave of the open project on this device, and the sheet to switch, create, rename,
// duplicate, delete, import and export projects. The storage itself is in ../storage/projects.js.
import { h, ICON } from './dom.js';
import { openSheet, confirmDialog, promptDialog, toast } from './sheet.js';
import { pickTextFile, saveBlob } from './files.js';
import { createProjectStorage, summarize } from '../storage/projects.js';
import { LIBRARY, KEY_NAMES, progressionSyms, keyString, surprise } from '../core/library.js';
import { newProject, exampleProject, EXAMPLES, normalizeProject, parseProjectFile, serializeProject, fileBase, newId, ProjectError } from '../core/project.js';

const SAVE_DELAY = 400;       // ms of quiet before an edit is written
const SAVING_SHOWN_AFTER = 300; // ms before "Saving…" is shown, so quick saves do not flicker
const MSG_PRIVATE = 'Private browsing: your work will not be kept after you close this tab. Use Export → Project file to save it.';

/** Short, friendly age of a time stamp. */
export function relativeTime(t, now = Date.now()) {
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

export function initProjects(app) {
  const storage = createProjectStorage();
  app.storage = storage;
  const store = app.store;
  const btn = document.getElementById('projBtn'), sub = document.getElementById('projSub');

  let started = false, touched = false, dirty = false, failing = false, saving = 0, showSaving = false, persistent = true;
  let timer = 0, savingTimer = 0, current = store.project;
  /** @type {Promise<any>} */ let queue = Promise.resolve();
  const enqueue = fn => (queue = queue.then(fn, fn));

  // ------------------------------------------------------------ the small status line under the project name
  function renderSub() {
    if (!started || !sub) return;
    sub.textContent = failing ? 'Not saved' : showSaving ? 'Saving…' : persistent ? 'My projects · saved' : 'My projects · this tab only';
  }

  // ------------------------------------------------------------ saving
  async function save(p, remember) {
    saving++;
    if (saving === 1) savingTimer = window.setTimeout(() => { showSaving = true; renderSub(); }, SAVING_SHOWN_AFTER);
    try {
      await storage.put(p);
      if (remember) await storage.setMeta('lastOpen', p.id);
      failing = false;
    } catch (e) {
      const conflict = e && e.code === 'conflict';
      if (!failing) toast(conflict ? 'This project was changed in another tab. Reload this tab to get the latest version before editing.' : e && e.name === 'StorageError' ? e.message : 'Could not save on this device. Export your project to a file to keep it safe.', { error: true });
      failing = true;
      // a failed save is tried again in a few seconds, unless another tab owns the newer version
      if (!conflict) { dirty = true; clearTimeout(timer); timer = window.setTimeout(flush, 5000); }
    }
    if (--saving === 0) { clearTimeout(savingTimer); showSaving = false; }
    renderSub();
  }
  /** Write the pending edit now. Resolves when everything queued so far is written. */
  function flush() {
    clearTimeout(timer);
    if (dirty) { dirty = false; const p = store.project; enqueue(() => save(p, false)); }
    return queue;
  }
  function cancelPending() { clearTimeout(timer); dirty = false; }

  store.subscribe(why => {
    const before = current; current = store.project;
    if (!started) { if (why.kind !== 'open') touched = true; return; }
    if (why.kind === 'open') {
      // an edit still waiting for its write belongs to the project that was just replaced
      if (dirty && before && before.id !== current.id) { const old = before; enqueue(() => save(old, false)); }
      cancelPending();
      const p = current; enqueue(() => save(p, true));
    } else { dirty = true; clearTimeout(timer); timer = window.setTimeout(flush, SAVE_DELAY); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', () => { flush(); });

  // ------------------------------------------------------------ start-up: restore the last project
  async function restore() {
    persistent = (await storage.ready()).persistent;
    started = true;
    if (!persistent) toast(MSG_PRIVATE);
    try {
      if (touched) { const p = store.project; await save(p, true); return; } // the person already started editing the example
      const last = await storage.getMeta('lastOpen');
      let p = last ? await storage.get(last) : null;
      if (!p) { const first = (await storage.list())[0]; p = first ? await storage.get(first.id) : null; }
      if (p) { store.open(p); await queue; } else await save(store.project, true);
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
    return (await safeList()).filter(x => x.id !== open.id).concat(open).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  /** The stored document of a project (the open one comes from memory). */
  async function load(id) { return id === store.project.id ? store.project : storage.get(id); }
  const failToast = (e, fallback) => toast(e && e.name === 'StorageError' ? e.message : fallback, { error: true });

  // ------------------------------------------------------------ the sheet
  function open() {
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

    function row(it, isOpen) {
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
        const next = (await storage.list())[0], p = next ? await storage.get(next.id) : null;
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
      let p;
      try { p = parseProjectFile(f.text); } catch (e) {
        toast(`Could not import “${f.name}”. ${e instanceof ProjectError ? e.message : 'Pick a project file exported from this app.'}`, { error: true }); return;
      }
      const taken = (await names()).concat(store.project.name);
      p.id = newId(); p.updatedAt = Date.now();
      if (taken.some(n => n.toLowerCase() === p.name.toLowerCase())) p.name = p.name.slice(0, 68) + ' (imported)';
      await openProject(p); close();
      toast(`Imported “${p.name}”.`);
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
