// The Melody tab: a small grid to tap a tune over the chords. Rows are the notes of the key, columns are
// half beats over one pass of the loop. Notes that belong to the chord of the moment are marked, as a guide.
import { h } from './dom.js';
import { toast } from './sheet.js';
import { Q, FLAT, SHARP } from '../core/theory.js';
import { idxAt } from '../core/song.js';

const STEP = 0.5;                       // beats per column
const LENGTHS = [[0.5, 'Short'], [1, '1 beat'], [2, '2 beats'], [4, '4 beats']];
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAX_COLS = 256;

export function initMelody(app) {
  const { store } = app, pane = document.getElementById('paneMelody');
  let octave = 0, length = 1;
  const grid = h('div', { class: 'mel-grid', role: 'group', 'aria-label': 'Melody grid: tap a square to add or remove a note' });
  const scroller = h('div', { class: 'mel-scroll' }, grid);
  const lenSel = h('select', { 'aria-label': 'Length of new notes', onChange: e => { length = +e.target.value; } }, LENGTHS.map(([v, t]) => h('option', { value: String(v), text: t, selected: v === 1 })));
  const octBtn = h('button', { class: 'small ghost', type: 'button', onClick: () => { octave = octave ? 0 : 12; render(); } });
  const clearBtn = h('button', { class: 'small ghost', type: 'button', text: 'Clear', onClick: () => {
    if (!store.project.tracks.melody.notes.length) return;
    store.update(p => { p.tracks.melody.notes = []; }, ''); toast('Melody cleared.', { action: 'Undo', onAction: () => store.undo() });
  } });
  const info = h('p', { class: 'hint' });
  pane.append(h('div', { class: 'mel-bar' }, lenSel, octBtn, clearBtn), scroller, info);

  /** The eight rows, high to low: one octave of the key's scale. */
  function rows(song) {
    const tonic = 60 + song.key.root + (song.key.root > 7 ? -12 : 0) + octave;
    return [...(song.key.minor ? MINOR : MAJOR), 12].map(x => tonic + x).reverse();
  }
  const name = (song, m) => (song.sharps ? SHARP : FLAT)[m % 12];

  function toggle(m, t, song) {
    const notes = store.project.tracks.melody.notes;
    const hit = notes.findIndex(n => n.m === m && t >= n.t - 1e-6 && t < n.t + n.d - 1e-6);
    if (hit >= 0) { store.update(p => { p.tracks.melody.notes.splice(hit, 1); }, ''); return; }
    if (notes.length >= 2000) { toast('That is the longest melody this app handles.', { error: true }); return; }
    const d = Math.min(length, song.beats - t);
    store.update(p => {
      // one voice: a new note cuts or replaces whatever overlaps it
      p.tracks.melody.notes = p.tracks.melody.notes.filter(n => !(n.t >= t - 1e-6 && n.t < t + d - 1e-6));
      for (const n of p.tracks.melody.notes) if (n.t < t && n.t + n.d > t) n.d = t - n.t;
      p.tracks.melody.notes.push({ t, d, m }); p.tracks.melody.notes.sort((a, b) => a.t - b.t);
    }, '');
    if (!app.engine.playing && !app.busy()) { try { app.engine.audition([m], store.project.tracks.melody.instrument); } catch (e) { /* silent is fine */ } }
  }
  grid.addEventListener('click', e => {
    const cell = /** @type {HTMLElement|null} */(/** @type {HTMLElement} */(e.target).closest('.mel-cell')), song = app.song();
    if (cell && song) toggle(+cell.dataset.m, +cell.dataset.t, song);
  });

  let key = '';
  function render() {
    const song = app.song(), p = store.project;
    octBtn.textContent = octave ? 'Higher octave' : 'Middle octave'; octBtn.setAttribute('aria-pressed', String(!!octave));
    if (!song) { grid.replaceChildren(); info.textContent = 'Add chords first: the melody is written over them.'; key = ''; return; }
    const cols = Math.min(MAX_COLS, Math.round(song.beats / STEP)), rs = rows(song), notes = p.tracks.melody.notes;
    const sig = JSON.stringify([cols, rs, notes, song.chords.slice(0, song.n).map(c => c.label + c.beats), p.beatsPerChord]);
    if (sig === key) return; key = sig;
    const frag = document.createDocumentFragment();
    grid.style.gridTemplateColumns = `44px repeat(${cols}, 44px)`;
    // header row: the chord that sounds on each beat
    frag.append(h('div', { class: 'mel-corner' }));
    let last = -1;
    for (let c = 0; c < cols; c++) {
      const i = idxAt(song, song.cycle + c * STEP * song.spb + 1e-6) % song.n;
      frag.append(h('div', { class: 'mel-head' + (c % 2 ? '' : ' beat'), text: i !== last ? song.chords[i].label : '' })); last = i;
    }
    for (const m of rs) {
      frag.append(h('div', { class: 'mel-name', text: name(song, m) }));
      for (let c = 0; c < cols; c++) {
        const t = c * STEP, i = idxAt(song, song.cycle + t * song.spb + 1e-6) % song.n, ch = song.chords[i];
        const inChord = Q[ch.q][0].some(x => (ch.root + x) % 12 === m % 12);
        const n = notes.find(x => x.m === m && t >= x.t - 1e-6 && t < x.t + x.d - 1e-6);
        const cls = 'mel-cell' + (c % 2 ? '' : ' beat') + (inChord ? ' tone' : '') + (n ? (Math.abs(n.t - t) < 1e-6 ? ' on start' : ' on') : '');
        frag.append(h('div', { class: cls, 'data-m': m, 'data-t': t }));
      }
    }
    grid.replaceChildren(frag);
    const outside = notes.filter(n => !rs.includes(n.m) && !rs.includes(n.m - 12) && !rs.includes(n.m + 12)).length;
    info.textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}. Dotted squares belong to the chord of the moment: they always sound right.` + (octave ? '' : '') + (outside ? ` ${outside} outside this key are kept but not shown.` : '') + (song.beats / STEP > MAX_COLS ? ' Only the first part of a very long loop can be edited here.' : '');
  }
  store.subscribe(why => { if (!why.tag.startsWith('mix:') && !why.tag.startsWith('text:')) render(); });
  document.getElementById('tabMelody').addEventListener('click', render);
  render();
}
