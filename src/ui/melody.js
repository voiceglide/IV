// The Melody tab, drawn as a piano roll: piano keys down the left (tap one to hear it), one row per semitone over two
// octaves of the key, columns are half beats over one pass of the loop, with beat and bar lines. Notes are bars whose
// length is the duration. Squares with a dot belong to the chord of the moment. Tap an empty square to add a note; tap a
// note to select it, then shorten, lengthen, move or delete it. Keyboard: arrows move between squares, Enter adds or
// selects, Delete removes the selected note.
import { h, ICON } from './dom.js';
import { toast } from './sheet.js';
import { Q, FLAT, SHARP } from '../core/theory.js';
import { idxAt } from '../core/song.js';

const STEP = 0.5, KEYW = 54;   // beats per column, pixels per row, width of the key column
const ZOOMS = [20, 24, 32, 44];      // pixels per column: the zoom steps; 20 is the narrowest square that can still be tapped
const MIN_CELL = ZOOMS[0];
const SHORT = window.matchMedia('(orientation:landscape) and (max-height:560px)');   // a phone on its side: lower rows, so more of them fit
const BAR_COLS = 8;                                 // four beats
const BLACK = [1, 3, 6, 8, 10];
const MAX_COLS = 256;
const same = (a, b) => Math.abs(a - b) < 1e-6;

export function initMelody(app) {
  const { store } = app, pane = document.getElementById('paneMelody');
  let ROW = SHORT.matches ? 28 : 32, length = 1, CELL = 44, lastBeats = -1;
  /** @type {{t:number, m:number}|null} */ let sel = null;
  /** The square that holds the keyboard focus (row, column), and its elements. */
  let rc = { r: -1, c: 0 };
  /** @type {HTMLElement[][]} */ let cellEls = [];
  const head = h('div', { class: 'mel-playhead', hidden: true });
  const grid = h('div', { class: 'mel-grid', role: 'grid', 'aria-label': 'Piano roll. Arrow keys move, Enter adds or selects a note.', tabIndex: -1 });
  const scroller = h('div', { class: 'mel-scroll' }, grid);
  const btn = (label, html, fn) => h('button', { class: 'small ghost', type: 'button', 'aria-label': label, html, onClick: fn });
  const shorter = btn('Shorter', '−', () => resize(-STEP)), longer = btn('Longer', '+', () => resize(STEP));
  const down = btn('Lower', ICON.chevron, () => nudge(-1)), up = btn('Higher', ICON.chevron, () => nudge(1));
  up.classList.add('flip');
  const del = btn('Delete this note', ICON.trash, () => deleteSel());
  const lenLabel = h('span', { class: 'mel-len' });
  const noteBar = h('div', { class: 'mel-bar', role: 'group', 'aria-label': 'Selected note' }, lenLabel, shorter, longer, down, up, del);
  const playBtn = h('button', { class: 'small', id: 'melPlay', type: 'button', text: 'Play', onClick: () => app.togglePlay() });
  const clearBtn = h('button', { class: 'small ghost', type: 'button', text: 'Clear', onClick: () => {
    if (!store.project.tracks.melody.notes.length) return;
    sel = null; store.update(p => { p.tracks.melody.notes = []; }, ''); toast('Melody cleared.', { action: 'Undo', onAction: () => store.undo() });
  } });
  clearBtn.classList.add('mel-clear');
  const zoomOut = btn('Zoom out', '−', () => zoom(-1)), zoomIn = btn('Zoom in', '+', () => zoom(1));
  const fitBtn = h('button', { class: 'small ghost', type: 'button', text: 'Fit', 'aria-label': 'Fit the whole loop in view', onClick: () => fit() });
  const info = h('p', { class: 'hint' });
  // paging: for a loop that is longer than the screen, step through it a screenful of whole bars at a time
  const barPx = () => BAR_COLS * CELL;
  const perPage = () => Math.max(1, Math.floor((scroller.clientWidth - KEYW) / barPx()));
  const totalBars = () => { const g = grid.getAttribute('aria-colcount'); return Math.max(1, Math.ceil((+g || 0) / BAR_COLS)); };
  const pageTo = bar => { scroller.scrollLeft = Math.max(0, bar) * barPx(); pager(); };
  const prevPage = btn('Previous bars', ICON.chevron, () => pageTo(Math.round(scroller.scrollLeft / barPx()) - perPage()));
  const nextPage = btn('Next bars', ICON.chevron, () => pageTo(Math.round(scroller.scrollLeft / barPx()) + perPage()));
  prevPage.classList.add('turn'); nextPage.classList.add('turn', 'flip');
  const pageLabel = h('span', { class: 'mel-page' });
  function pager() {
    const total = totalBars(), first = Math.min(total, Math.floor(scroller.scrollLeft / barPx() + 0.02) + 1);
    const last = Math.max(first, Math.min(total, Math.floor((scroller.scrollLeft + scroller.clientWidth - KEYW - 1) / barPx() + 0.02) + 1));
    pageLabel.textContent = first === last ? `Bar ${first}` : `Bars ${first}–${last}`;
    pageLabel.setAttribute('aria-label', `Showing ${first === last ? 'bar ' + first : 'bars ' + first + ' to ' + last} of ${total}`);
    prevPage.disabled = scroller.scrollLeft <= 1; nextPage.disabled = last >= total && scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1;
  }
  scroller.addEventListener('scroll', pager, { passive: true });
  // one toolbar: the hint, Play and Clear, then (on its own row) zoom and paging; on a phone on its side they share one row
  const tools = h('div', { class: 'mel-bar mel-tools' }, h('span', { class: 'mel-len', text: 'Tap a square to add a note' }), playBtn, clearBtn, h('span', { class: 'mel-break' }),
    zoomOut, zoomIn, fitBtn, h('span', { class: 'mel-gap' }), prevPage, pageLabel, nextPage);
  pane.append(tools, noteBar, scroller, info);
  function setCell(px) { const c = Math.max(MIN_CELL, Math.min(ZOOMS[ZOOMS.length - 1], Math.floor(px + 1e-6))); if (c === CELL) return; const mid = (scroller.scrollLeft + scroller.clientWidth / 2 - KEYW) / CELL; CELL = c; render(); scroller.scrollLeft = Math.max(0, mid * CELL + KEYW - scroller.clientWidth / 2); pager(); }
  function zoom(dir) { const i = ZOOMS.findIndex(z => z >= CELL - 0.5); setCell(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + dir))]); }
  function fit() { const song = app.song(); if (!song) return; const cols = Math.min(MAX_COLS, Math.round(song.beats / STEP)); setCell((scroller.clientWidth - KEYW - 2) / cols); scroller.scrollLeft = 0; pager(); }

  const edit = fn => store.update(fn, 'melody');
  const find = () => (sel ? store.project.tracks.melody.notes.find(n => same(n.t, /** @type {any} */(sel).t) && n.m === /** @type {any} */(sel).m) : null);
  const hear = m => { if (!app.busy()) { try { app.engine.audition([m], store.project.tracks.melody.instrument); } catch (e) { /* silent is fine */ } } };
  function deleteSel() { const n = find(); if (!n) return; edit(p => { p.tracks.melody.notes = p.tracks.melody.notes.filter(x => !(same(x.t, n.t) && x.m === n.m)); }); sel = null; render(); }

  /** The rows, high to low: every semitone over two octaves of the key, like the keys of a piano. */
  function rows(song) {
    const tonic = 60 + song.key.root + (song.key.root > 7 ? -12 : 0), out = [];
    for (let m = tonic + 24; m >= tonic; m--) out.push(m);
    return out;
  }
  const name = (song, m) => (song.sharps ? SHARP : FLAT)[m % 12] + (Math.floor(m / 12) - 1);

  function resize(d) {
    const n = find(), song = app.song(); if (!n || !song) return;
    const next = Math.max(STEP, Math.min(song.beats - n.t, n.d + d)); if (same(next, n.d)) return;
    length = next;
    edit(p => {
      const me = p.tracks.melody.notes.find(x => same(x.t, n.t) && x.m === n.m); me.d = next;
      // one voice: a longer note swallows what it now covers
      p.tracks.melody.notes = p.tracks.melody.notes.filter(x => x === me || !(x.t > me.t - 1e-6 && x.t < me.t + me.d - 1e-6));
    });
  }
  function nudge(dir) {
    const n = find(), song = app.song(); if (!n || !song) return;
    const m = n.m + dir;
    const rs = rows(song); if (m < rs[rs.length - 1] || m > rs[0]) return;
    edit(p => { p.tracks.melody.notes.find(x => same(x.t, n.t) && x.m === n.m).m = m; });
    sel = { t: n.t, m }; hear(m); render();
  }
  function tap(m, t, song) {
    const notes = store.project.tracks.melody.notes;
    const hit = notes.find(n => n.m === m && t >= n.t - 1e-6 && t < n.t + n.d - 1e-6);
    if (hit) { sel = sel && same(sel.t, hit.t) && sel.m === hit.m ? null : { t: hit.t, m: hit.m }; if (sel) hear(m); render(); return; }
    if (notes.length >= 2000) { toast('That is the longest melody this app handles.', { error: true }); return; }
    const d = Math.min(length, song.beats - t);
    sel = { t, m };
    edit(p => {
      // one voice: a new note cuts or replaces whatever overlaps it
      p.tracks.melody.notes = p.tracks.melody.notes.filter(n => !(n.t >= t - 1e-6 && n.t < t + d - 1e-6));
      for (const n of p.tracks.melody.notes) if (n.t < t && n.t + n.d > t) n.d = t - n.t;
      p.tracks.melody.notes.push({ t, d, m }); p.tracks.melody.notes.sort((a, b) => a.t - b.t);
    });
    hear(m);
  }
  const cellAt = (el) => ({ r: +el.dataset.r, c: +el.dataset.c });
  grid.addEventListener('click', e => {
    const target = /** @type {HTMLElement} */(e.target), song = app.song();
    const key = target.closest('.mel-name');
    if (key) { hear(+/** @type {HTMLElement} */(key).dataset.m); return; }
    const cell = /** @type {HTMLElement|null} */(target.closest('.mel-cell'));
    if (cell && song) { rc = cellAt(cell); tap(+cell.dataset.m, +cell.dataset.t, song); }
  });
  grid.addEventListener('keydown', e => {
    const cell = /** @type {HTMLElement|null} */(/** @type {HTMLElement} */(e.target).closest('.mel-cell')), song = app.song(); if (!cell || !song) return;
    const { r, c } = cellAt(cell), cols = cellEls[0] ? cellEls[0].length : 0;
    let nr = r, nc = c;
    if (e.key === 'ArrowUp') nr--; else if (e.key === 'ArrowDown') nr++; else if (e.key === 'ArrowLeft') nc--; else if (e.key === 'ArrowRight') nc++;
    else if (e.key === 'Home') nc = 0; else if (e.key === 'End') nc = cols - 1; else if (e.key === 'PageUp') nr -= 12; else if (e.key === 'PageDown') nr += 12;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rc = { r, c }; tap(+cell.dataset.m, +cell.dataset.t, song); return; }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && cell.classList.contains('on')) { e.preventDefault(); sel = { t: +cell.dataset.t, m: +cell.dataset.m }; const n = find(); if (n) sel = { t: n.t, m: n.m }; deleteSel(); return; }
    else return;
    e.preventDefault();
    nr = Math.max(0, Math.min(cellEls.length - 1, nr)); nc = Math.max(0, Math.min(cols - 1, nc));
    focusCell(nr, nc);
  });
  function focusCell(r, c) {
    const to = cellEls[r] && cellEls[r][c]; if (!to) return;
    const from = cellEls[rc.r] && cellEls[rc.r][rc.c]; if (from) from.tabIndex = -1;
    rc = { r, c }; to.tabIndex = 0; to.focus({ preventScroll: true });
    const s = scroller.getBoundingClientRect(), b = to.getBoundingClientRect();
    if (b.left < s.left + KEYW) scroller.scrollLeft -= s.left + KEYW - b.left; else if (b.right > s.right) scroller.scrollLeft += b.right - s.right;
    if (b.top < s.top + ROW) scroller.scrollTop -= s.top + ROW - b.top; else if (b.bottom > s.bottom) scroller.scrollTop += b.bottom - s.bottom;
  }
  // names for screen readers are made when a square is reached, so a long roll stays light
  grid.addEventListener('focusin', e => {
    const cell = /** @type {HTMLElement} */(e.target), song = app.song(); if (!song || !cell.classList || !cell.classList.contains('mel-cell')) return;
    const m = +cell.dataset.m, t = +cell.dataset.t, n = store.project.tracks.melody.notes.find(x => x.m === m && t >= x.t - 1e-6 && t < x.t + x.d - 1e-6);
    cell.setAttribute('aria-label', `${name(song, m)}, beat ${Math.floor(t) + 1}${t % 1 ? ' and a half' : ''}${n ? `, note of ${n.d === 1 ? '1 beat' : n.d + ' beats'}${sel && same(sel.t, n.t) && sel.m === n.m ? ', selected' : ''}` : ', empty'}`);
  });

  function recenterView(song, rs, notes, chordAt) {
    {
      // vertically: on the melody if there is one, else on the chord tone of the first chord nearest the middle of the keyboard (C4–C5);
      // horizontally: on the play head if it is playing, else on the first note
      let r = -1;
      if (notes.length) r = rs.indexOf(notes[0].m);
      if (r < 0) {
        const ch = song.chords[chordAt(0)], tones = rs.map((m, k) => [m, k]).filter(([m]) => Q[ch.q][0].some(x => (ch.root + x) % 12 === m % 12));
        const best = tones.sort((a, b) => Math.abs(a[0] - 64) - Math.abs(b[0] - 64))[0]; r = best ? best[1] : Math.floor(rs.length / 2);
      }
      const rowEl = cellEls[r] && cellEls[r][0];
      if (rowEl) scroller.scrollTop = Math.max(0, rowEl.offsetTop + ROW / 2 - scroller.clientHeight / 2);
      // with no melody yet, C4 (or the lowest row there is) always stays in view
      const low = cellEls[Math.max(0, rs.indexOf(Math.max(60, rs[rs.length - 1])))];
      if (!notes.length && low && low[0] && low[0].offsetTop + ROW > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = low[0].offsetTop + ROW - scroller.clientHeight;
      const beats = lastBeats >= 0 ? lastBeats : notes.length ? notes[0].t : 0;
      scroller.scrollLeft = Math.max(0, beats / STEP * CELL - scroller.clientWidth / 4);
    }
  }

  let key = '';
  function render(recenter = false) {
    const song = app.song(), p = store.project;
    if (!song) { grid.replaceChildren(); cellEls = []; noteBar.hidden = true; info.textContent = 'Add chords first: the melody is written over them.'; key = ''; return; }
    const cols = Math.min(MAX_COLS, Math.round(song.beats / STEP)), rs = rows(song), notes = p.tracks.melody.notes;
    const cur = find(); if (sel && !cur) sel = null;
    noteBar.hidden = !cur;
    if (cur) lenLabel.textContent = `${name(song, cur.m)} · ${cur.d === 1 ? '1 beat' : cur.d + ' beats'}`;
    const sig = JSON.stringify([ROW, CELL, cols, rs, notes, sel, song.chords.slice(0, song.n).map(c => c.label + c.beats), p.beatsPerChord]);
    const chordAt = c => idxAt(song, song.cycle + c * STEP * song.spb + 1e-6) % song.n;
    if (sig === key) { if (recenter) recenterView(song, rs, notes, chordAt); return; }
    key = sig;
    const hadFocus = grid.contains(document.activeElement);
    if (rc.r < 0 || rc.r >= rs.length || rc.c >= cols) { const first = notes.length ? rs.indexOf(notes[0].m) : rs.length - 1 - 12; rc = { r: Math.max(0, first), c: notes.length ? Math.round(notes[0].t / STEP) : 0 }; }
    const frag = document.createDocumentFragment();
    grid.style.gridTemplateColumns = `${KEYW}px repeat(${cols}, ${CELL}px)`; grid.style.setProperty('--cell', CELL + 'px');
    grid.style.gridAutoRows = `${ROW}px`;
    grid.setAttribute('aria-rowcount', String(rs.length)); grid.setAttribute('aria-colcount', String(cols));
    const hrow = h('div', { class: 'mel-row', role: 'row' }, h('div', { class: 'mel-corner', role: 'presentation' }));
    let last = -1;
    for (let c = 0; c < cols; c++) { const i = chordAt(c); hrow.append(h('div', { role: 'columnheader', class: 'mel-head' + (c % 2 ? '' : ' beat') + (c % BAR_COLS ? '' : ' bar') + (i !== last ? ' new' : ''), text: i !== last ? song.chords[i].label : '' })); last = i; }
    frag.append(hrow);
    cellEls = [];
    rs.forEach((m, r) => {
      const pc = m % 12, black = BLACK.includes(pc), tonic = (m - song.key.root) % 12 === 0;
      const label = black ? '' : name(song, m);
      const row = h('div', { class: 'mel-row' + (black ? ' blk' : ''), role: 'row' },
        h('div', { class: 'mel-name ' + (black ? 'black' : 'white') + (pc === 0 ? ' c' : '') + (tonic ? ' tonic' : ''), role: 'rowheader', 'data-m': m, 'aria-label': `Piano key ${name(song, m)}: tap to hear`, text: label }));
      /** @type {HTMLElement[]} */ const line = [];
      for (let c = 0; c < cols; c++) {
        const t = c * STEP, ch = song.chords[chordAt(c)];
        const inChord = Q[ch.q][0].some(x => (ch.root + x) % 12 === pc);
        const n = notes.find(x => x.m === m && t >= x.t - 1e-6 && t < x.t + x.d - 1e-6);
        let cls = 'mel-cell' + (c % 2 ? '' : ' beat') + (c % BAR_COLS ? '' : ' bar') + (inChord ? ' tone' : '') + (tonic ? ' tonic' : '');
        if (n) cls += ' on' + (same(n.t, t) ? ' start' : '') + (same(n.t + n.d, t + STEP) ? ' end' : '') + (sel && same(sel.t, n.t) && sel.m === n.m ? ' sel' : '');
        const el = h('div', { class: cls, role: 'gridcell', tabIndex: r === rc.r && c === rc.c ? 0 : -1, 'aria-selected': n ? String(!!(sel && same(sel.t, n.t) && sel.m === n.m)) : null, 'data-m': m, 'data-t': t, 'data-r': r, 'data-c': c, text: n && same(n.t, t) ? name(song, m) : '' });
        line.push(el); row.append(el);
      }
      cellEls.push(line); frag.append(row);
    });
    frag.append(head);
    const top = scroller.scrollTop, left = scroller.scrollLeft;
    grid.replaceChildren(frag);
    scroller.scrollTop = top; scroller.scrollLeft = left;
    if (hadFocus) { const el = cellEls[rc.r] && cellEls[rc.r][rc.c]; if (el) el.focus({ preventScroll: true }); }
    const hidden = notes.filter(n => !rs.includes(n.m)).length;
    info.textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}. Squares with a dot belong to the chord of the moment: they always sound right. Tap a piano key to hear it.` + (hidden ? ` ${hidden} ${hidden === 1 ? 'note is' : 'notes are'} above or below this view.` : '') + (song.beats / STEP > MAX_COLS ? ' Only the first part of a very long loop can be edited here.' : '');
    if (recenter) recenterView(song, rs, notes, chordAt);
    pager();
  }
  store.subscribe(why => { if (!why.tag.startsWith('mix:') && !why.tag.startsWith('text:')) render(); });
  document.getElementById('tabMelody').addEventListener('click', () => render(true));
  store.subscribeUi((ui, prev) => { if (ui.tab === 'Melody' && prev.tab !== 'Melody') window.setTimeout(() => render(true), 0); });
  const onShort = () => { ROW = SHORT.matches ? 28 : 32; render(); };
  if (SHORT.addEventListener) SHORT.addEventListener('change', onShort);
  render();

  let playing = false;
  return {
    /** Show where the loop is (in beats from its start), or hide the line with a negative value. */
    playhead(beats) {
      const on = beats >= 0; if (on !== playing && !pane.hidden) { playing = on; playBtn.textContent = on ? 'Stop' : 'Play'; }
      if (beats < 0) lastBeats = -1;
      if (beats < 0 || pane.hidden) { if (!head.hidden) head.hidden = true; return; }
      lastBeats = beats; head.hidden = false; head.style.transform = `translateX(${KEYW + beats / STEP * CELL}px)`;
    },
  };
}
