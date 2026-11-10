// Undo / redo over immutable project snapshots.
// The project is plain JSON, so a snapshot is the object itself: every edit replaces it with a new one.

export function createHistory(limit = 200) {
  /** @type {any[]} */ let past = [];
  /** @type {any[]} */ let future = [];
  /** @type {any} */ let present = null;
  let lastTag = '', lastAt = 0;
  return {
    /** Start a fresh history on this state (opening a project). */
    reset(state) { past = []; future = []; present = state; lastTag = ''; },
    get present() { return present; },
    /**
     * Record a new state. Edits that share a `tag` and follow each other within `mergeMs`
     * (typing in a field, dragging a slider) collapse into one undo step.
     */
    push(state, tag = '', now = Date.now(), mergeMs = 800) {
      if (state === present) return;
      const merge = tag && tag === lastTag && now - lastAt < mergeMs && past.length;
      if (!merge) { past.push(present); if (past.length > limit) past.shift(); }
      present = state; future = []; lastTag = tag; lastAt = now;
    },
    canUndo() { return past.length > 0; },
    canRedo() { return future.length > 0; },
    undo() { if (!past.length) return present; future.push(present); present = past.pop(); lastTag = ''; return present; },
    redo() { if (!future.length) return present; past.push(present); present = future.pop(); lastTag = ''; return present; },
  };
}
