// The Drums tab: a step sequencer. One bar of 4 beats in 16 steps; one row per sound. Tap a square to switch a hit
// on or off, press and hold it (or Shift+Enter, or the A key) to change how hard it is struck: soft, normal, accent.
// Tap a row name to hear its sound. The play head shows where the bar is while the loop plays.
// Every change goes through store.update with a tag that starts with "drums:".
import { h } from './dom.js';
import { toast } from './sheet.js';
import { DRUM_LANES, DRUM_LANE_LABEL, DRUM_PATTERNS, DRUM_PRESETS, DRUM_STEPS, DRUM_SWING_MAX, effectiveSteps, emptySteps } from '../core/project.js';
import { hitDrum } from '../audio/drums.js';

const CELL = 44, LEVEL_NAME = ['off', 'soft', 'normal', 'accent'], HOLD_MS = 450;
const copy = g => Object.fromEntries(Object.entries(g).map(([l, r]) => [l, r.slice()]));

/** @param {any} app the app object (store, engine, song, busy) @param {HTMLElement} container where the tab is drawn */
export function initDrums(app, container) {
  const { store } = app;
  let brush = 2, focus = { lane: 0, step: 0 };
  /** @type {HTMLElement[][]} */ let cells = [];
  const head = h('div', { class: 'dr-playhead', hidden: true, 'aria-hidden': 'true' });
  const grid = h('div', { class: 'dr-grid', role: 'grid', 'aria-label': 'Drum grid: one bar, sixteen steps. Arrow keys move, Enter or Space switches a hit on or off, A changes how hard it is struck.', 'aria-rowcount': DRUM_LANES.length });
  const scroller = h('div', { class: 'dr-scroll' }, grid);

  // ---- hearing a sound
  function hear(lane, level) {
    if (app.busy && app.busy()) return;
    const v = [0, 0.4, 0.7, 1][level] || 0.7;
    try {
      if (app.engine.auditionDrum) { app.engine.auditionDrum(lane, v); return; }
      const ac = app.engine.unlock(), g = ac.createGain(); g.gain.value = 0.9; g.connect(ac.destination);
      hitDrum(ac, g, lane, ac.currentTime + 0.02, v);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 1500);
    } catch (e) { /* no sound available: the grid still works */ }
  }

  // ---- editing
  const stepsNow = () => effectiveSteps(store.project.tracks.drums);
  /** Change the grid. A preset is copied into the project's own grid first, so editing a preset makes it yours. */
  function edit(fn, tag) {
    store.update(p => {
      const d = p.tracks.drums;
      d.steps = copy(effectiveSteps(d)); d.pattern = 'custom';
      fn(d);
    }, tag);
  }
  function setCell(lane, step, level) {
    const id = DRUM_LANES[lane];
    edit(d => { d.steps[id][step] = level; }, `drums:step:${id}:${step}`);
  }
  function toggle(lane, step) {
    const cur = stepsNow()[DRUM_LANES[lane]][step];
    const next = cur ? 0 : brush;
    setCell(lane, step, next); if (next) hear(DRUM_LANES[lane], next);
  }
  function cycle(lane, step) {
    const cur = stepsNow()[DRUM_LANES[lane]][step], next = !cur ? 3 : cur === 3 ? 1 : cur + 1;
    setCell(lane, step, next); hear(DRUM_LANES[lane], next);
  }

  // ---- controls
  const brushBtns = [[1, 'Soft'], [2, 'Normal'], [3, 'Accent']].map(([lv, name]) => h('button', {
    class: 'small ghost dr-brush', type: 'button', text: name, 'data-level': lv, 'aria-pressed': String(lv === brush),
    onClick: () => { brush = /** @type {number} */(lv); for (const b of brushBtns) b.setAttribute('aria-pressed', String(+b.dataset.level === brush)); },
  }));
  const preset = h('select', { 'aria-label': 'Start from a preset pattern', onChange: e => {
    const id = e.target.value; e.target.value = ''; if (!Object.hasOwn(DRUM_PRESETS, id)) return;
    store.update(p => { p.tracks.drums.steps = copy(DRUM_PRESETS[/** @type {'soft'} */(id)]); p.tracks.drums.pattern = 'custom'; }, 'drums:preset');
  } }, h('option', { value: '', text: 'Start from…' }),
  ['soft', 'basic', 'four', 'half'].map(id => h('option', { value: id, text: DRUM_PATTERNS[id] })));
  const clearBtn = h('button', { class: 'small ghost', type: 'button', text: 'Clear', onClick: () => {
    const g = stepsNow();
    if (store.project.tracks.drums.pattern === 'off' || !DRUM_LANES.some(l => g[l].some(Boolean))) return;
    store.update(p => { p.tracks.drums.steps = emptySteps(); p.tracks.drums.pattern = 'custom'; }, 'drums:clear');
    toast('Drums cleared.', { action: 'Undo', onAction: () => store.undo() });
  } });
  const swingOut = h('output', { class: 'dr-swing-val' });
  const swing = h('input', { type: 'range', min: 0, max: DRUM_SWING_MAX, step: 0.05, value: 0, 'aria-label': 'Swing: how late the off-beat sixteenths are played',
    onInput: e => { store.update(p => { p.tracks.drums.swing = +e.target.value; }, 'drums:swing'); } });
  const info = h('p', { class: 'hint', text: 'Tap a square to add a hit, tap it again to remove it. Press and hold a hit to make it soft, normal or accent. Tap a name to hear it.' });
  container.classList.add('dr-pane');
  container.append(
    h('div', { class: 'dr-bar' }, preset, clearBtn),
    h('div', { class: 'dr-bar', role: 'group', 'aria-label': 'Strength of new hits' }, h('span', { class: 'dr-cap', text: 'New hits' }), brushBtns),
    h('div', { class: 'dr-bar' }, h('label', { class: 'dr-cap', for: 'drSwing', text: 'Swing' }), swing, swingOut),
    scroller, info);
  swing.id = 'drSwing';

  // ---- the grid
  function build() {
    cells = [];
    const frag = document.createDocumentFragment();
    const top = h('div', { class: 'dr-row dr-top', role: 'row', 'aria-rowindex': 1 }, h('div', { class: 'dr-name', role: 'columnheader', 'aria-label': 'Sound' }));
    for (let s = 0; s < DRUM_STEPS; s++) top.append(h('div', { class: 'dr-num' + (s % 4 ? '' : ' beat'), role: 'columnheader', text: s % 4 ? '·' : String(s / 4 + 1), 'aria-label': `Step ${s + 1}` }));
    frag.append(top);
    DRUM_LANES.forEach((lane, li) => {
      const row = h('div', { class: 'dr-row', role: 'row', 'aria-rowindex': li + 2 });
      row.append(h('div', { class: 'dr-name', role: 'rowheader' }, h('button', { type: 'button', class: 'dr-hear', text: DRUM_LANE_LABEL[lane], 'aria-label': `${DRUM_LANE_LABEL[lane]}: tap to hear`, onClick: () => hear(lane, 2) })));
      const r = [];
      for (let s = 0; s < DRUM_STEPS; s++) {
        const c = h('div', { class: 'dr-cell' + (s % 4 === 0 ? ' beat' : '') + (Math.floor(s / 4) % 2 ? ' alt' : ''), role: 'gridcell', tabindex: li === focus.lane && s === focus.step ? 0 : -1,
          'data-lane': lane, 'data-step': s });
        r.push(c); row.append(c);
      }
      cells.push(r); frag.append(row);
    });
    frag.append(head);
    grid.replaceChildren(frag);
  }
  function paint() {
    const g = stepsNow();
    DRUM_LANES.forEach((lane, li) => {
      for (let s = 0; s < DRUM_STEPS; s++) {
        const c = cells[li][s], lv = g[lane][s];
        c.dataset.level = String(lv);
        c.className = 'dr-cell' + (s % 4 === 0 ? ' beat' : '') + (Math.floor(s / 4) % 2 ? ' alt' : '') + (lv ? ` on l${lv}` : '');
        c.setAttribute('aria-label', `${DRUM_LANE_LABEL[lane]}, beat ${Math.floor(s / 4) + 1}, step ${s % 4 + 1}: ${LEVEL_NAME[lv]}`);
      }
    });
    const d = store.project.tracks.drums;
    swing.value = String(d.swing); swingOut.textContent = d.swing ? Math.round(d.swing / DRUM_SWING_MAX * 100) + '%' : 'none';
    const total = DRUM_LANES.reduce((n, l) => n + g[l].filter(Boolean).length, 0);
    info.textContent = (total ? `${total} ${total === 1 ? 'hit' : 'hits'} in the bar. ` : 'The bar is empty. ') + 'Tap a square to add a hit, tap it again to remove it. Press and hold a hit to make it soft, normal or accent. Tap a name to hear it.';
  }
  const at = el => { const c = el && el.closest && el.closest('.dr-cell'); return c ? { lane: DRUM_LANES.indexOf(c.dataset.lane), step: +c.dataset.step } : null; };
  function moveFocus(lane, step, doFocus = true) {
    cells[focus.lane][focus.step].tabIndex = -1;
    focus = { lane: Math.max(0, Math.min(DRUM_LANES.length - 1, lane)), step: Math.max(0, Math.min(DRUM_STEPS - 1, step)) };
    const c = cells[focus.lane][focus.step]; c.tabIndex = 0; if (doFocus) c.focus();
  }

  // pointer: a short press toggles, a press held for HOLD_MS changes the strength
  /** @type {{timer:any, lane:number, step:number, held:boolean, x:number, y:number}|null} */ let press = null;
  grid.addEventListener('pointerdown', e => {
    const a = at(e.target); if (!a) return;
    if (press) clearTimeout(press.timer);
    const me = { lane: a.lane, step: a.step, held: false, x: e.clientX, y: e.clientY, timer: setTimeout(() => { me.held = true; cycle(me.lane, me.step); }, HOLD_MS) };
    press = me; moveFocus(a.lane, a.step, false);
  });
  const cancel = () => { if (press) { clearTimeout(press.timer); press = null; } };
  grid.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancel(); });
  grid.addEventListener('pointercancel', cancel);
  grid.addEventListener('pointerleave', cancel);
  grid.addEventListener('pointerup', e => {
    if (!press) return;
    const p = press; cancel();
    if (!p.held && at(e.target) && at(e.target).lane === p.lane && at(e.target).step === p.step) toggle(p.lane, p.step);
  });
  grid.addEventListener('contextmenu', e => { if (at(e.target)) e.preventDefault(); });
  // keyboard
  grid.addEventListener('keydown', e => {
    const a = at(e.target); if (!a) return;
    const k = e.key;
    if (k === 'ArrowRight') moveFocus(a.lane, a.step + 1); else if (k === 'ArrowLeft') moveFocus(a.lane, a.step - 1);
    else if (k === 'ArrowDown') moveFocus(a.lane + 1, a.step); else if (k === 'ArrowUp') moveFocus(a.lane - 1, a.step);
    else if (k === 'Home') moveFocus(a.lane, 0); else if (k === 'End') moveFocus(a.lane, DRUM_STEPS - 1);
    else if (k === 'Enter' && e.shiftKey || k === 'a' || k === 'A') cycle(a.lane, a.step);
    else if (k === 'Enter' || k === ' ') toggle(a.lane, a.step);
    else return;
    e.preventDefault(); e.stopPropagation();
  });

  // ---- the play head
  let lastStep = -1;
  function frame() {
    const song = app.song && app.song(), eng = app.engine;
    const visible = container.getClientRects().length > 0;
    let step = -1;
    if (visible && song && eng.playing) {
      const loopStart = song.starts[song.n], pos = ((eng.time() - loopStart) % song.cycle + song.cycle) % song.cycle;
      step = Math.floor(pos / (song.spb / 4) + 1e-6) % DRUM_STEPS;
    }
    if (step !== lastStep) {
      lastStep = step; head.hidden = step < 0;
      if (step >= 0) head.style.transform = `translateX(${step * CELL}px)`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  build(); paint();
  store.subscribe(why => { if (why.kind === 'edit' && why.tag.startsWith('mix:')) return; paint(); });
  return {
    /** Show the step that is sounding, or hide the head with a negative value. */
    refresh: paint,
  };
}
