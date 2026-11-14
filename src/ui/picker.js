// The inline chord picker: root row, type row, bass note and length for the selected chord.
// It lives in the bottom panel (no sheet), is built once and only updated, so focus never jumps, and every pick is heard.
import { h, ICON } from './dom.js';
import { parseChord, FLAT, QDISP } from '../core/theory.js';
import { duplicateChord, chordParts, chordSym } from '../core/edit.js';

const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'aug', '6', 'm6', '9', 'maj9', 'm9', 'add9', 'madd9', 'm7b5', 'dim7', '7sus4', '13', 'mmaj7', '5'];
const Q_LABEL = q => (q === '' ? 'major' : q === 'm' ? 'minor' : QDISP[q]);
const BEATS = [0.5, 1, 2, 3, 4, 6, 8, 12, 16];
const rootName = r => (r === 6 ? 'F♯' : FLAT[r]);
const opt = (value, text) => h('option', { value: String(value), text });
const pretty = sym => { const c = parseChord(sym); return c ? c.label : sym; };

/** @returns {{el:HTMLElement, render:()=>void}} */
export function initPicker(app) {
  const { store } = app;
  const title = h('div', { class: 'pk-title', 'aria-live': 'polite' });
  const group = (label, cls, kids) => h('div', { class: 'prow ' + cls, role: 'group', 'aria-label': label }, kids);
  const roots = FLAT.map((_, r) => h('button', { type: 'button', class: 'opt', text: rootName(r), 'data-root': r, onClick: () => change(parts => chordSym(r, parts.q, -1)) }));
  const quals = QUALITIES.map(q => h('button', { type: 'button', class: 'opt', text: Q_LABEL(q), 'data-q': q, onClick: () => change(parts => chordSym(parts.root, q, parts.bass, parts.rootName)) }));
  const bass = h('select', { id: 'chordBass', onChange: e => change(parts => chordSym(parts.root, parts.q, +e.target.value, parts.rootName)) },
    opt(-1, 'The root (normal)'), FLAT.map((_, r) => opt(r, rootName(r))));
  const len = h('select', { id: 'chordLen', onChange: e => edit(ch => { ch.beats = e.target.value === '' ? null : +e.target.value; }, 'beats') },
    opt('', 'Default'), BEATS.map(b => opt(b, b === 1 ? '1 beat' : `${b} beats`)));
  const section = h('input', { type: 'text', id: 'chordSection', maxLength: 60, placeholder: 'e.g. Chorus', autocomplete: 'off', onChange: e => edit(ch => { ch.section = e.target.value.trim(); }, 'section') });
  const dup = h('button', { class: 'small ghost', type: 'button', html: ICON.copy + '<span>Copy</span>', 'aria-label': 'Duplicate this chord', onClick: () => {
    const i = store.selectedIndex(); if (i < 0) return;
    let made = ''; store.update(p => { made = p.chords[duplicateChord(p, i)].id; }, ''); store.select(made);
  } });
  const body = h('div', { class: 'picker-body' },
    h('div', { class: 'pk-head' }, title, dup),
    group('Root note', 'roots', roots), group('Chord type', 'quals', quals),
    h('div', { class: 'row' },
      h('div', null, h('label', { for: 'chordBass', text: 'Bass note' }), bass),
      h('div', null, h('label', { for: 'chordLen', text: 'Length' }), len)),
    h('details', { class: 'more' }, h('summary', { text: 'Name a section' }), h('label', { for: 'chordSection', text: 'A section that starts at this chord (optional)' }), section));
  const none = h('p', { class: 'hint pk-none', text: 'Tap a chord above to change it, or tap + to add one.' });
  const el = h('div', { class: 'picker', id: 'picker' }, none, body);

  const selected = () => { const i = store.selectedIndex(); return i < 0 ? null : store.project.chords[i]; };
  function edit(fn, tag) { const c = selected(); if (!c) return; const id = c.id; store.update(p => { const ch = p.chords.find(x => x.id === id); if (ch) fn(ch); }, `chord:${id}:${tag}`); }
  function change(build) {
    const c = selected(); if (!c) return;
    const sym = build(chordParts(c.sym)); edit(ch => { ch.sym = sym; }, 'sym');
    const ch = parseChord(sym); if (ch) app.audition(ch);
  }
  /** Keep the chosen button in view in its row without moving the page. */
  function keepInView(row, btn) {
    if (!btn || !row.offsetParent || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect(), b = btn.getBoundingClientRect();
    if (b.left < r.left || b.right > r.right) row.scrollLeft += b.left - r.left - (r.width - b.width) / 2;
  }
  let lastId = null;
  function render() {
    const c = selected(); none.hidden = !!c; body.hidden = !c; if (!c) { lastId = null; return; }
    const parts = chordParts(c.sym), rootsRow = /** @type {HTMLElement} */(el.querySelector('.roots')), qualsRow = /** @type {HTMLElement} */(el.querySelector('.quals'));
    title.textContent = pretty(c.sym);
    for (const b of roots) b.setAttribute('aria-pressed', String(+b.dataset.root === parts.root));
    for (const b of quals) b.setAttribute('aria-pressed', String(b.dataset.q === parts.q));
    if (document.activeElement !== bass) bass.value = String(parts.bass);
    if (document.activeElement !== len) {
      if (c.beats !== null && !BEATS.includes(c.beats) && ![...len.options].some(o => o.value === String(c.beats))) len.append(opt(c.beats, `${c.beats} beats`));
      len.value = c.beats === null ? '' : String(c.beats);
      len.options[0].textContent = `Default (${store.project.beatsPerChord} beats)`;
    }
    if (document.activeElement !== section) section.value = c.section;
    if (c.id !== lastId) { lastId = c.id; keepInView(rootsRow, roots[parts.root]); keepInView(qualsRow, quals.find(b => b.dataset.q === parts.q)); }
  }
  store.subscribe(render); store.subscribeUi(render); render();
  return { el, render };
}
