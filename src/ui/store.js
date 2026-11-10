// The app's state: the open project and its undo history. Interface modules read `store.project`
// and change it only through `store.update`, so every edit is undoable and saved.
import { createHistory } from '../core/history.js';

const clone = x => (globalThis.structuredClone ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function createStore() {
  const hist = createHistory();
  /** @type {Set<(why:{kind:'open'|'edit'|'undo'|'redo', tag:string})=>void>} */
  const listeners = new Set();
  const emit = (kind, tag = '') => { for (const fn of listeners) fn({ kind, tag }); };
  return {
    /** @returns {import('../core/project.js').Project} */
    get project() { return hist.present; },
    /** Replace the open project and forget the undo history. */
    open(project) { hist.reset(project); emit('open'); },
    /**
     * Edit the project: `fn` receives a private copy to change in place.
     * `tag` names the kind of edit: repeated edits with the same tag (typing, dragging) undo as one step,
     * and tags that start with "mix:" only touch faders, pan, mute and solo.
     * @param {(draft: import('../core/project.js').Project) => void} fn @param {string} [tag]
     */
    update(fn, tag = '') {
      const draft = clone(hist.present); fn(draft); draft.updatedAt = Date.now();
      hist.push(draft, tag); emit('edit', tag);
    },
    undo() { if (hist.canUndo()) { hist.undo(); emit('undo'); } },
    redo() { if (hist.canRedo()) { hist.redo(); emit('redo'); } },
    canUndo: () => hist.canUndo(), canRedo: () => hist.canRedo(),
    /** @param {(why:{kind:'open'|'edit'|'undo'|'redo', tag:string})=>void} fn */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
