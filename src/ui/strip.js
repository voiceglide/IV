// The chord strip: always visible under the preview. Tap a chord to select (and hear) it, + adds one,
// drag a chord to reorder (a mouse drags at once; a finger presses and holds a moment so the strip can still scroll),
// the cross on the selected chord removes it with an Undo message. The playing chord is highlighted.
// Chords are drawn once and kept by id, so a change only touches the chip that changed (and focus stays put).
import { h, ICON } from './dom.js';
import { toast } from './sheet.js';
import { parseChord } from '../core/theory.js';
import { insertChord, removeChord, moveChordTo } from '../core/edit.js';

const pretty = sym => { const c = parseChord(sym); return c ? c.label : sym; };
const HOLD_MS = 260, MOVE_PX = 8;

export function initStrip(app) {
  const { store } = app, root = document.getElementById('strip');
  const scroller = h('div', { class: 'strip-scroll', role: 'list', 'aria-label': 'Chords, in order. Drag to reorder.' });
  const addBtn = h('button', { class: 'chord add', type: 'button', id: 'addChord', 'aria-label': 'Add a chord', html: ICON.plus, onClick: addChord });
  root.append(scroller, addBtn);
  /** @type {Map<string, {wrap:HTMLElement, btn:HTMLElement, sec:HTMLElement, name:HTMLElement, len:HTMLElement, rm:HTMLElement|null}>} */
  const cells = new Map();
  const empty = h('p', { class: 'empty', text: 'No chords yet. Tap + to start.' });
  let current = -1;

  function addChord() {
    if (store.project.chords.length >= 512) { toast('That is the longest progression this app handles (512 chords).', { error: true }); return; }
    const at = store.selectedIndex(), chords = store.project.chords, last = at >= 0 ? chords[at] : chords[chords.length - 1];
    let made = '';
    store.update(p => { const i = insertChord(p, at >= 0 ? at : p.chords.length - 1, last ? last.sym : 'C'); made = p.chords[i].id; });
    store.setUi({ selectedId: made, editOpen: true, tab: store.ui.tab });
    const i = store.selectedIndex(); if (i >= 0) app.goToChord(i);
    reveal(made);
  }
  /** Remove a chord; the message offers Undo. */
  function removeAt(id) {
    const i = store.project.chords.findIndex(c => c.id === id); if (i < 0) return;
    const name = pretty(store.project.chords[i].sym);
    store.update(p => removeChord(p, i), '');
    toast(`${name} removed.`, { action: 'Undo', onAction: () => store.undo() });
  }
  function reveal(id) {
    const c = cells.get(id); if (!c) return;
    const s = scroller.getBoundingClientRect(), r = c.wrap.getBoundingClientRect();
    if (r.left < s.left + 4) scroller.scrollLeft -= s.left + 4 - r.left; else if (r.right > s.right - 4) scroller.scrollLeft += r.right - s.right + 4;
  }

  function makeCell(c) {
    const sec = h('span', { class: 'sec' }), name = h('b'), len = h('small');
    const btn = h('button', { class: 'chord', type: 'button', 'data-id': c.id }, sec, h('span', { class: 'nm' }, name, len));
    const wrap = h('div', { class: 'cw', role: 'listitem', 'data-id': c.id }, btn);
    btn.addEventListener('click', () => onTap(c.id));
    btn.addEventListener('keydown', e => onKey(e, c.id));
    return { wrap, btn, sec, name, len, rm: /** @type {HTMLElement|null} */(null) };
  }
  function onTap(id) {
    if (suppress) return;
    const i = store.project.chords.findIndex(c => c.id === id); if (i < 0) return;
    store.setUi({ selectedId: id, editOpen: store.ui.editOpen || !wide() });
    app.goToChord(i);
  }
  const wide = () => window.matchMedia('(min-width:900px) and (min-height:561px)').matches;
  /** Arrow keys move between chords; Alt + arrow moves the chord itself. */
  function onKey(e, id) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const chords = store.project.chords, i = chords.findIndex(c => c.id === id), d = e.key === 'ArrowLeft' ? -1 : 1;
    if (e.altKey) { e.preventDefault(); if (i + d >= 0 && i + d < chords.length) store.update(p => { moveChordTo(p, i, i + d); }, ''); return; }
    const next = chords[i + d]; if (!next) return; e.preventDefault();
    const c = cells.get(next.id); if (c) c.btn.focus();
  }

  function render() {
    const p = store.project, sel = store.ui.selectedId, ids = new Set(p.chords.map(c => c.id));
    const had = /** @type {HTMLElement|null} */(document.activeElement);
    if (p.chords.length && empty.parentNode) empty.remove();
    for (const [id, c] of cells) if (!ids.has(id)) { c.wrap.remove(); cells.delete(id); }
    p.chords.forEach((ch, i) => {
      let c = cells.get(ch.id);
      if (!c) { c = makeCell(ch); cells.set(ch.id, c); }
      const label = pretty(ch.sym), on = ch.id === sel;
      if (c.name.textContent !== label) c.name.textContent = label;
      const len = ch.beats ? String(ch.beats) : ''; if (c.len.textContent !== len) c.len.textContent = len;
      if (c.sec.textContent !== ch.section) c.sec.textContent = ch.section;
      c.btn.classList.toggle('has-sec', !!ch.section);
      c.btn.setAttribute('aria-label', `Chord ${i + 1} of ${p.chords.length}: ${label}${ch.beats ? `, ${ch.beats} beats` : ''}${ch.section ? `, starts ${ch.section}` : ''}`);
      c.btn.setAttribute('aria-pressed', String(on));
      c.wrap.classList.toggle('sel', on);
      if (on && !c.rm) { c.rm = h('button', { class: 'rm', type: 'button', 'aria-label': `Remove ${label}`, html: ICON.close, onClick: () => removeAt(ch.id) }); c.wrap.append(c.rm); }
      else if (!on && c.rm) { c.rm.remove(); c.rm = null; }
      else if (c.rm) c.rm.setAttribute('aria-label', `Remove ${label}`);
      if (scroller.children[i] !== c.wrap) scroller.insertBefore(c.wrap, scroller.children[i] || null);
    });
    // moving a chip in the page can drop focus: put it back
    if (had && had !== document.body && document.activeElement !== had && document.contains(had)) had.focus({ preventScroll: true });
    if (!p.chords.length) { if (!empty.parentNode) scroller.append(empty); } else if (empty.parentNode) empty.remove();
    current = -1; mark(lastPlaying);
  }
  store.subscribe(() => { if (!drag) render(); });
  let lastSel = store.ui.selectedId;
  store.subscribeUi(() => { render(); if (store.ui.selectedId !== lastSel) { lastSel = store.ui.selectedId; if (lastSel) reveal(lastSel); } });

  // -------------------------------------------------------------- drag to reorder
  /** @type {{id:string, from:number, x0:number, el:HTMLElement, pid:number, started:boolean, timer:number, touch:boolean, y0:number}|null} */
  let drag = null, suppress = false;
  const blockTouch = e => { if (drag && drag.started) e.preventDefault(); };
  document.addEventListener('touchmove', blockTouch, { passive: false });
  scroller.addEventListener('pointerdown', e => {
    const btn = /** @type {HTMLElement|null} */(/** @type {HTMLElement} */(e.target).closest('button.chord')); if (!btn || e.button > 0 || (btn.dataset.id === undefined)) return;
    const from = store.project.chords.findIndex(c => c.id === btn.dataset.id), touch = e.pointerType !== 'mouse';
    drag = { id: /** @type {string} */(btn.dataset.id), from, x0: e.clientX, y0: e.clientY, el: /** @type {HTMLElement} */(btn.parentElement), pid: e.pointerId, started: false, touch, timer: 0 };
    if (touch) drag.timer = window.setTimeout(() => { if (drag) begin(); }, HOLD_MS);
  });
  function begin() {
    if (!drag || drag.started) return;
    drag.started = true; drag.el.classList.add('dragging'); scroller.classList.add('reordering');
    try { scroller.setPointerCapture(drag.pid); } catch (e) { /* the drag still works without capture */ }
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* no haptics */ } }
  }
  /** Where the dragged chord would land: the number of other chords whose middle is left of the pointer. */
  function target(x) {
    let k = 0;
    for (const c of store.project.chords) {
      if (c.id === (drag && drag.id)) continue;
      const cell = cells.get(c.id); if (!cell) continue;
      const r = cell.wrap.getBoundingClientRect(); if (x > r.left + r.width / 2) k++;
    }
    return k;
  }
  scroller.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x0;
    if (!drag.started) {
      if (drag.touch) { if (Math.hypot(dx, e.clientY - drag.y0) > MOVE_PX) { clearTimeout(drag.timer); drag = null; } return; }
      if (Math.abs(dx) < MOVE_PX) return; begin();
    }
    if (!drag) return;
    drag.el.style.transform = `translateX(${dx}px)`;
    const s = scroller.getBoundingClientRect();
    if (e.clientX < s.left + 28) scroller.scrollLeft -= 12; else if (e.clientX > s.right - 28) scroller.scrollLeft += 12;
    const to = target(e.clientX);
    for (const [, c] of cells) c.wrap.classList.remove('drop-before', 'drop-after');
    const others = store.project.chords.filter(c => c.id !== drag.id);
    const hit = others[to] ? cells.get(others[to].id) : null, last = others.length ? cells.get(others[others.length - 1].id) : null;
    if (hit) hit.wrap.classList.add('drop-before'); else if (last) last.wrap.classList.add('drop-after');
  });
  function finish(e, cancel) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag; drag = null; clearTimeout(d.timer);
    if (!d.started) return;
    suppress = true; window.setTimeout(() => { suppress = false; }, 0);
    d.el.classList.remove('dragging'); d.el.style.transform = ''; scroller.classList.remove('reordering');
    for (const [, c] of cells) c.wrap.classList.remove('drop-before', 'drop-after');
    try { scroller.releasePointerCapture(d.pid); } catch (err) { /* already released */ }
    const to = cancel ? d.from : target(e.clientX);
    if (to !== d.from) store.update(p => { moveChordTo(p, d.from, to); }, '');
    else render();
  }
  scroller.addEventListener('pointerup', e => finish(e, false));
  scroller.addEventListener('pointercancel', e => finish(e, true));
  scroller.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });

  let lastPlaying = -1;
  function mark(i) {
    lastPlaying = i;
    if (i === current) return; current = i;
    const list = store.project.chords;
    list.forEach((ch, k) => { const c = cells.get(ch.id); if (!c) return; if (k === i) c.btn.setAttribute('aria-current', 'true'); else c.btn.removeAttribute('aria-current'); });
    if (i >= 0 && list[i] && !drag) reveal(list[i].id);
  }
  render();
  return { highlight: mark, render };
}
