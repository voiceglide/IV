// The app's state: the open project and its undo history, plus a small `ui` slice (which chord is selected,
// which Edit tab is showing, whether the Edit panel is open) shared by every UI module.
// Interface modules read `store.project` and change it only through `store.update`, so every edit is undoable and saved.
import { createHistory } from '../core/history.js';

const clone = x => (globalThis.structuredClone ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

/** @typedef {{selectedId:string|null, tab:string, editOpen:boolean}} UiState */

/** @param {{editOpen?:boolean}} [init] */
export function createStore(init = {}) {
  const hist = createHistory();
  /** @type {Set<(why:{kind:'open'|'edit'|'undo'|'redo', tag:string})=>void>} */
  const listeners = new Set();
  /** @type {Set<(ui:UiState, prev:UiState)=>void>} */
  const uiListeners = new Set();
  const emit = (kind, tag = '') => { for (const fn of listeners) fn({ kind, tag }); };
  /** @type {UiState} */
  let ui = { selectedId: null, tab: 'Chords', editOpen: !!init.editOpen };
  /** Change the ui slice; listeners hear about it only when something really changed. @param {Partial<UiState>} patch */
  function setUi(patch) {
    const prev = ui, next = { ...ui, ...patch };
    if (next.selectedId === prev.selectedId && next.tab === prev.tab && next.editOpen === prev.editOpen) return;
    ui = next; for (const fn of uiListeners) fn(ui, prev);
  }
  /** After any change of the chords, keep the selection on a chord that exists: the one that took the place of a deleted one. */
  function fixSelection(before) {
    const id = ui.selectedId; if (!id) return;
    const chords = hist.present.chords;
    if (chords.some(c => c.id === id)) return;
    const was = before ? before.chords.findIndex(c => c.id === id) : -1;
    const next = chords.length ? chords[Math.min(Math.max(was, 0), chords.length - 1)] : null;
    setUi({ selectedId: next ? next.id : null });
  }
  return {
    /** @returns {import('../core/project.js').Project} */
    get project() { return hist.present; },
    /** Replace the open project and forget the undo history. The selection and the Edit tab start over. */
    open(project) { hist.reset(project); ui = { ...ui, selectedId: null, tab: 'Chords' }; emit('open'); for (const fn of uiListeners) fn(ui, ui); },
    /**
     * Edit the project: `fn` receives a private copy to change in place.
     * `tag` names the kind of edit: repeated edits with the same tag (typing, dragging) undo as one step,
     * and tags that start with "mix:" only touch faders, pan, mute and solo.
     * @param {(draft: import('../core/project.js').Project) => void} fn @param {string} [tag]
     */
    update(fn, tag = '') {
      const before = hist.present, draft = clone(before); fn(draft); draft.updatedAt = Date.now();
      hist.push(draft, tag); fixSelection(before); emit('edit', tag);
    },
    undo() { if (hist.canUndo()) { const b = hist.present; hist.undo(); fixSelection(b); emit('undo'); } },
    redo() { if (hist.canRedo()) { const b = hist.present; hist.redo(); fixSelection(b); emit('redo'); } },
    canUndo: () => hist.canUndo(), canRedo: () => hist.canRedo(),
    /** @param {(why:{kind:'open'|'edit'|'undo'|'redo', tag:string})=>void} fn */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** The ui slice: read it here, change it with `setUi` or `select`. Never part of the project, never saved, never undone. */
    get ui() { return ui; },
    setUi,
    /** Select a chord by its id (or null). */
    select(id) { setUi({ selectedId: id }); },
    /** The index of the selected chord in the open project, or −1. */
    selectedIndex() { return ui.selectedId ? hist.present.chords.findIndex(c => c.id === ui.selectedId) : -1; },
    /** @param {(ui:UiState, prev:UiState)=>void} fn */
    subscribeUi(fn) { uiListeners.add(fn); return () => uiListeners.delete(fn); },
  };
}
