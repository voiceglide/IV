// The Melody tab: a grid to tap a tune over the chords. Rows are notes (two octaves of the key, or every
// semitone), columns are half beats over one pass of the loop. Notes that belong to the chord of the moment
// carry a dot, as a guide. Tap an empty square to add a note; tap a note to select it, then shorten, lengthen,
// move or delete it with the buttons.
import { h, ICON } from './dom.js';
import { toast } from './sheet.js';
import { Q, FLAT, SHARP } from '../core/theory.js';
import { idxAt } from '../core/song.js';

const STEP = 0.5, CELL = 44;            // beats per column, pixels per square
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAX_COLS = 256;
const same = (a, b) => Math.abs(a - b) < 1e-6;

export function initMelody(app) {
  const { store } = app, pane = document.getElementById('paneMelody');
  let chromatic = false, length = 1;
  /** @type {{t:number, m:number}|null} */ let sel = null;
  const head = h('div', { class: 'mel-playhead', hidden: true });
  const grid = h('div', { class: 'mel-grid', role: 'group', 'aria-label': 'Melody grid: tap an empty square to add a note, tap a note to select it' });
  const scroller = h('div', { class: 'mel-scroll' }, grid);
  const btn = (label, html, fn) => h('button', { class: 'small ghost', type: 'button', 'aria-label': label, html, onClick: fn });
  const shorter = btn('Shorter', '−', () => resize(-STEP)), longer = btn('Longer', '+', () => resize(STEP));
  const down = btn('Lower', ICON.chevron, () => nudge(-1)), up = btn('Higher', ICON.chevron, () => nudge(1));
  up.classList.add('flip');
  const del = btn('Delete this note', ICON.trash, () => { const n = find(); if (!n) return; edit(p => { p.tracks.melody.notes = p.tracks.melody.notes.filter(x => !(same(x.t, n.t) && x.m === n.m)); }); sel = null; render(); });
  const lenLabel = h('span', { class: 'mel-len' });
  const noteBar = h('div', { class: 'mel-bar', role: 'group', 'aria-label': 'Selected note' }, lenLabel, shorter, longer, down, up, del);
  const allBtn = h('button', { class: 'small ghost', type: 'button', text: 'All notes', 'aria-pressed': 'false', onClick: () => { chromatic = !chromatic; render(true); } });
  const clearBtn = h('button', { class: 'small ghost', type: 'button', text: 'Clear', onClick: () => {
    if (!store.project.tracks.melody.notes.length) return;
    sel = null; store.update(p => { p.tracks.melody.notes = []; }, ''); toast('Melody cleared.', { action: 'Undo', onAction: () => store.undo() });
  } });
  const info = h('p', { class: 'hint' });
  pane.append(h('div', { class: 'mel-bar' }, h('span', { class: 'mel-len', text: 'Tap a square to add a note' }), allBtn, clearBtn), noteBar, scroller, info);

  const edit = fn => store.update(fn, 'melody');
  const find = () => (sel ? store.project.tracks.melody.notes.find(n => same(n.t, /** @type {any} */(sel).t) && n.m === /** @type {any} */(sel).m) : null);
  const hear = m => { if (!app.busy()) { try { app.engine.audition([m], store.project.tracks.melody.instrument); } catch (e) { /* silent is fine */ } } };

  /** The rows, high to low: two octaves of the key's scale, or every semitone. */
  function rows(song) {
    const tonic = 60 + song.key.root + (song.key.root > 7 ? -12 : 0), out = [];
    const steps = chromatic ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : (song.key.minor ? MINOR : MAJOR);
    for (const o of [0, 12]) for (const x of steps) out.push(tonic + o + x);
    out.push(tonic + 24);
    return out.reverse();
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
    const rs = rows(song), i = rs.indexOf(n.m), m = i < 0 ? n.m + dir : rs[i - dir];
    if (m === undefined || m < 36 || m > 96) return;
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
  grid.addEventListener('click', e => {
    const cell = /** @type {HTMLElement|null} */(/** @type {HTMLElement} */(e.target).closest('.mel-cell')), song = app.song();
    if (cell && song) tap(+cell.dataset.m, +cell.dataset.t, song);
  });

  let key = '';
  function render(recenter = false) {
    const song = app.song(), p = store.project;
    allBtn.setAttribute('aria-pressed', String(chromatic));
    if (!song) { grid.replaceChildren(); noteBar.hidden = true; info.textContent = 'Add chords first: the melody is written over them.'; key = ''; return; }
    const cols = Math.min(MAX_COLS, Math.round(song.beats / STEP)), rs = rows(song), notes = p.tracks.melody.notes;
    const cur = find(); if (sel && !cur) sel = null;
    noteBar.hidden = !cur;
    if (cur) lenLabel.textContent = `${name(song, cur.m)} · ${cur.d === 1 ? '1 beat' : cur.d + ' beats'}`;
    const sig = JSON.stringify([cols, rs, notes, sel, song.chords.slice(0, song.n).map(c => c.label + c.beats), p.beatsPerChord]);
    if (sig === key) return; key = sig;
    const frag = document.createDocumentFragment();
    grid.style.gridTemplateColumns = `${CELL}px repeat(${cols}, ${CELL}px)`;
    frag.append(h('div', { class: 'mel-corner' }));
    let last = -1;
    const chordAt = c => idxAt(song, song.cycle + c * STEP * song.spb + 1e-6) % song.n;
    for (let c = 0; c < cols; c++) { const i = chordAt(c); frag.append(h('div', { class: 'mel-head' + (c % 2 ? '' : ' beat') + (i !== last ? ' new' : ''), text: i !== last ? song.chords[i].label : '' })); last = i; }
    for (const m of rs) {
      const tonic = (m - song.key.root) % 12 === 0;
      frag.append(h('div', { class: 'mel-name' + (tonic ? ' tonic' : ''), text: name(song, m) }));
      for (let c = 0; c < cols; c++) {
        const t = c * STEP, ch = song.chords[chordAt(c)];
        const inChord = Q[ch.q][0].some(x => (ch.root + x) % 12 === m % 12);
        const n = notes.find(x => x.m === m && t >= x.t - 1e-6 && t < x.t + x.d - 1e-6);
        let cls = 'mel-cell' + (c % 2 ? '' : ' beat') + (inChord ? ' tone' : '') + (tonic ? ' tonic' : '');
        if (n) cls += ' on' + (same(n.t, t) ? ' start' : '') + (same(n.t + n.d, t + STEP) ? ' end' : '') + (sel && same(sel.t, n.t) && sel.m === n.m ? ' sel' : '');
        frag.append(h('div', { class: cls, 'data-m': m, 'data-t': t }));
      }
    }
    frag.append(head);
    grid.replaceChildren(frag);
    const hidden = notes.filter(n => !rs.includes(n.m)).length;
    info.textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}. Squares with a dot belong to the chord of the moment: they always sound right.` + (hidden ? ` ${hidden} ${hidden === 1 ? 'note is' : 'notes are'} outside this view: turn on All notes to see ${hidden === 1 ? 'it' : 'them'}.` : '') + (song.beats / STEP > MAX_COLS ? ' Only the first part of a very long loop can be edited here.' : '');
    if (recenter) { const first = grid.querySelector('.mel-cell.on') || grid.querySelector('.mel-name.tonic'); if (first) first.scrollIntoView({ block: 'center', inline: 'nearest' }); }
  }
  store.subscribe(why => { if (!why.tag.startsWith('mix:') && !why.tag.startsWith('text:')) render(); });
  document.getElementById('tabMelody').addEventListener('click', () => render(true));
  render();

  return {
    /** Show where the loop is (in beats from its start), or hide the line with a negative value. */
    playhead(beats) {
      if (beats < 0 || pane.hidden) { if (!head.hidden) head.hidden = true; return; }
      head.hidden = false; head.style.transform = `translateX(${CELL + beats / STEP * CELL}px)`;
    },
  };
}
