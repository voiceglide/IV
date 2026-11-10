// The chord track editor: a row of chord chips to tap, the tempo and key settings, and a text box for people who type.
import { h, ICON } from './dom.js';
import { openSheet, toast } from './sheet.js';
import { parseChord, FLAT, QDISP } from '../core/theory.js';
import { chordsFromText, chordsToText } from '../core/project.js';
import { insertChord, removeChord, duplicateChord, moveChord, chordParts, chordSym } from '../core/edit.js';

const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'aug', '6', 'm6', '9', 'maj9', 'm9', 'add9', 'madd9', 'm7b5', 'dim7', '7sus4', '13', 'mmaj7', '5'];
const Q_LABEL = q => (q === '' ? 'major' : q === 'm' ? 'minor' : QDISP[q]);
const BEATS = [1, 2, 3, 4, 6, 8, 12, 16];
const pretty = sym => { const c = parseChord(sym); return c ? c.label : sym; };
const opt = (value, text, sel) => h('option', { value: String(value), text, selected: sel });

export function initChords(app) {
  const { store } = app, pane = document.getElementById('paneChords');
  const chips = h('div', { class: 'chips', role: 'list', 'aria-label': 'Chords, in order' });
  const tempo = h('input', { type: 'text', inputMode: 'decimal', id: 'tempo', autocomplete: 'off', 'aria-label': 'Tempo in beats per minute' });
  const beats = h('select', { id: 'beats' }, BEATS.map(b => opt(b, String(b))));
  const key = h('select', { id: 'key' }, opt('auto', 'Auto'));
  for (let r = 0; r < 12; r++) for (const m of [false, true]) key.append(opt(r + (m ? ':m' : ''), FLAT[r] + (m ? ' minor' : ' major')));
  const text = h('textarea', { id: 'chordText', spellcheck: false, autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Chords as text', 'aria-describedby': 'chordTextErr' });
  const textErr = h('div', { class: 'err', id: 'chordTextErr', role: 'alert' });
  const step = d => () => setTempo(store.project.tempo + d);
  pane.append(
    chips,
    h('div', { class: 'row3' },
      h('div', null, h('label', { for: 'tempo', text: 'Tempo (BPM)' }), h('div', { class: 'stepper' },
        h('button', { class: 'ghost', type: 'button', 'aria-label': 'Slower', text: '−', onClick: step(-2) }), tempo,
        h('button', { class: 'ghost', type: 'button', 'aria-label': 'Faster', text: '+', onClick: step(2) }))),
      h('div', null, h('label', { for: 'beats', text: 'Beats per chord' }), beats),
      h('div', null, h('label', { for: 'key', text: 'Key' }), key)),
    h('details', { class: 'more' }, h('summary', { text: 'Type the chords instead' }),
      text, textErr,
      h('p', { class: 'hint', html: 'Separate chords with spaces. <code>Fm7:2</code> lasts 2 beats, <code>(C G Am F)x2</code> repeats, <code>[Chorus]</code> names a section. In 6/8, set the tempo in eighth notes and give each chord 6 beats.' })));

  function setTempo(v) {
    if (!(v >= 20 && v <= 300)) { toast('Tempo must be between 20 and 300 BPM.', { error: true }); tempo.value = String(store.project.tempo); return; }
    store.update(p => { p.tempo = Math.round(v * 100) / 100; }, 'tempo');
  }
  tempo.addEventListener('change', () => setTempo(parseFloat(tempo.value.replace(',', '.'))));
  tempo.addEventListener('keydown', e => { if (e.key === 'Enter') tempo.blur(); });
  beats.addEventListener('change', () => store.update(p => { p.beatsPerChord = +beats.value; }, 'beats'));
  key.addEventListener('change', () => store.update(p => { p.key = key.value; }, 'key'));

  let typing = 0, ownText = false;
  text.addEventListener('input', () => {
    clearTimeout(typing);
    typing = window.setTimeout(() => {
      const r = chordsFromText(text.value);
      if (r.bad.length) { textErr.textContent = `Not a chord: ${r.bad.slice(0, 4).join(', ')}. Use names like C, Am7, F#m or G/B.`; return; }
      textErr.textContent = ''; ownText = true;
      store.update(p => { p.chords = r.chords; }, 'chords:text');
      ownText = false;
    }, 450);
  });

  function audition(sym) { const c = parseChord(sym); if (c) app.audition(c); }

  function openChord(i) {
    let idx = i;
    const body = h('div', { class: 'stack' });
    let unsub = () => {};
    const sheet = openSheet({ title: 'Chord', body, id: 'chordSheet', onClose: () => unsub() });
    unsub = store.subscribe(() => { if (idx >= store.project.chords.length) sheet.close(); else draw(); });
    const set = (fn, tag) => store.update(p => fn(p.chords[idx], p), `chord:${idx}:${tag}`);
    function draw() {
      const c = store.project.chords[idx]; if (!c) return;
      const parts = chordParts(c.sym), n = store.project.chords.length;
      sheet.setTitle(`Chord ${idx + 1} of ${n}: ${pretty(c.sym)}`);
      const grid = (label, items, cls) => h('div', null, h('div', { class: 'gh', text: label }), h('div', { class: 'grid ' + cls, role: 'group', 'aria-label': label }, items));
      const pick = sym => { set(ch => { ch.sym = sym; }, 'sym'); audition(sym); };
      const roots = FLAT.map((name, r) => h('button', { type: 'button', class: 'opt', text: r === 6 ? 'F♯' : name, 'aria-pressed': String(parts.root === r),
        onClick: () => pick(chordSym(r, parts.q, -1)) }));
      const quals = QUALITIES.map(q => h('button', { type: 'button', class: 'opt', text: Q_LABEL(q), 'aria-pressed': String(parts.q === q),
        onClick: () => pick(chordSym(parts.root, q, parts.bass, parts.rootName)) }));
      const bass = h('select', { id: 'chordBass', onChange: e => pick(chordSym(parts.root, parts.q, +e.target.value, parts.rootName)) },
        opt(-1, 'The root (normal)', parts.bass < 0), FLAT.map((name, r) => r === parts.root ? null : opt(r, r === 6 ? 'F♯' : name, parts.bass === r)));
      const len = h('select', { id: 'chordLen', onChange: e => set(ch => { ch.beats = e.target.value === '' ? null : +e.target.value; }, 'beats') },
        opt('', `Default (${store.project.beatsPerChord} beats)`, c.beats === null),
        [0.5, ...BEATS].map(b => opt(b, b === 1 ? '1 beat' : `${b} beats`, c.beats === b)),
        c.beats !== null && ![0.5, ...BEATS].includes(c.beats) ? opt(c.beats, `${c.beats} beats`, true) : null);
      const section = h('input', { type: 'text', id: 'chordSection', value: c.section, maxLength: 60, placeholder: 'e.g. Chorus', autocomplete: 'off',
        onChange: e => set(ch => { ch.section = e.target.value.trim(); }, 'section') });
      const go = d => () => { store.update(p => { idx = moveChord(p, idx, d); }, ''); };
      body.replaceChildren(
        grid('Root', roots, 'g6'), grid('Type', quals, 'g4'),
        h('div', { class: 'row' },
          h('div', null, h('label', { for: 'chordBass', text: 'Bass note' }), bass),
          h('div', null, h('label', { for: 'chordLen', text: 'Length' }), len)),
        h('div', null, h('label', { for: 'chordSection', text: 'Section that starts here (optional)' }), section),
        h('div', { class: 'btns four' },
          h('button', { class: 'ghost', type: 'button', disabled: idx === 0, 'aria-label': 'Move earlier', html: ICON.left, onClick: go(-1) }),
          h('button', { class: 'ghost', type: 'button', disabled: idx === n - 1, 'aria-label': 'Move later', html: ICON.right, onClick: go(1) }),
          h('button', { class: 'ghost', type: 'button', 'aria-label': 'Duplicate this chord', html: ICON.copy, onClick: () => store.update(p => { idx = duplicateChord(p, idx); }, '') }),
          h('button', { class: 'ghost danger', type: 'button', 'aria-label': 'Delete this chord', html: ICON.trash, onClick: () => {
            const name = pretty(c.sym); store.update(p => removeChord(p, idx), ''); sheet.close();
            toast(`${name} removed.`, { action: 'Undo', onAction: () => store.undo() });
          } })),
        h('button', { class: 'big', type: 'button', text: 'Done', onClick: () => sheet.close() }));
    }
    draw();
  }

  let current = -1;
  function render() {
    const p = store.project;
    chips.replaceChildren();
    p.chords.forEach((c, i) => {
      if (c.section) chips.append(h('span', { class: 'sec', text: c.section }));
      chips.append(h('button', { class: 'chord', type: 'button', role: 'listitem', 'aria-label': `Chord ${i + 1}: ${pretty(c.sym)}${c.beats ? `, ${c.beats} beats` : ''}. Edit`,
        onClick: () => openChord(i) }, h('b', { text: pretty(c.sym) }), c.beats ? h('small', { text: `${c.beats}` }) : null));
    });
    chips.append(h('button', { class: 'chord add', type: 'button', 'aria-label': 'Add a chord', html: ICON.plus, onClick: () => {
      if (store.project.chords.length >= 512) { toast('That is the longest progression this app handles (512 chords).', { error: true }); return; }
      const last = store.project.chords[store.project.chords.length - 1]; let at = 0;
      store.update(pr => { at = insertChord(pr, pr.chords.length - 1, last ? last.sym : 'C'); }, '');
      openChord(at);
    } }, h('span', { text: 'Add' })));
    if (!p.chords.length) chips.prepend(h('p', { class: 'empty', text: 'No chords yet. Tap Add to start your progression.' }));
    if (document.activeElement !== tempo) tempo.value = String(p.tempo);
    beats.value = String(p.beatsPerChord);
    if (beats.value !== String(p.beatsPerChord)) { beats.append(opt(p.beatsPerChord, String(p.beatsPerChord), true)); }
    key.value = p.key;
    if (!ownText && document.activeElement !== text) { text.value = chordsToText(p.chords); textErr.textContent = ''; }
    current = -1;
  }
  store.subscribe(why => { if (!why.tag.startsWith('mix:') && !why.tag.startsWith('text:')) render(); });
  render();

  return {
    /** Mark the chord that is sounding (index in the loop), or −1 for none. */
    highlight(i) {
      if (i === current) return; current = i;
      chips.querySelectorAll('.chord:not(.add)').forEach((el, k) => { if (k === i) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current'); });
    },
  };
}
