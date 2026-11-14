// The Chords tab: the inline picker for the selected chord, then tempo (with tap tempo), beats per chord, key,
// transpose, "Surprise me", and a text box for people who type. The always-visible chord strip lives in strip.js.
import { h } from './dom.js';
import { toast } from './sheet.js';
import { FLAT } from '../core/theory.js';
import { chordsFromText, chordsToText, newId } from '../core/project.js';
import { transposeChords, tempoFromTaps } from '../core/edit.js';
import { surprise, KEY_NAMES } from '../core/library.js';
import { initStrip } from './strip.js';
import { initPicker } from './picker.js';

const BEATS = [1, 2, 3, 4, 6, 8, 12, 16];
const opt = (value, text, sel) => h('option', { value: String(value), text, selected: sel });

/** Replace the chords of a project with new ones, keeping the ids of chords that stay at the same place. */
export function setChordList(p, chords) {
  const old = p.chords;
  p.chords = chords.map((c, i) => ({ id: (old[i] && old[i].id) || newId().slice(0, 8), ...c }));
}

export function initChords(app) {
  const { store } = app, pane = document.getElementById('paneChords');
  const strip = initStrip(app), picker = initPicker(app);
  const tempo = h('input', { type: 'text', inputMode: 'decimal', id: 'tempo', autocomplete: 'off', 'aria-label': 'Tempo in beats per minute' });
  const beats = h('select', { id: 'beats' }, BEATS.map(b => opt(b, String(b))));
  const key = h('select', { id: 'key' }, opt('auto', 'Auto'));
  for (let r = 0; r < 12; r++) for (const m of [false, true]) key.append(opt(r + (m ? ':m' : ''), FLAT[r] + (m ? ' minor' : ' major')));
  const text = h('textarea', { id: 'chordText', spellcheck: false, autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Chords as text', 'aria-describedby': 'chordTextErr' });
  const textErr = h('div', { class: 'err', id: 'chordTextErr', role: 'alert' });
  const step = d => () => setTempo(store.project.tempo + d);

  // tap tempo: tap in time; the tempo follows the last few taps; a pause of two seconds starts over
  /** @type {number[]} */ let taps = [];
  const tap = h('button', { class: 'ghost', id: 'tapTempo', type: 'button', text: 'Tap', 'aria-label': 'Tap the tempo', onClick: () => {
    const now = performance.now(); if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now); const bpm = tempoFromTaps(taps); if (bpm) setTempo(bpm);
  } });
  const transposeBy = d => () => { if (!store.project.chords.length) return; store.update(p => transposeChords(p, d), 'transpose'); app.goToChord(Math.max(0, store.selectedIndex())); };
  const keyLabel = h('span', { class: 'tp-key' });
  const surpriseBtn = h('button', { class: 'ghost', id: 'surprise', type: 'button', text: 'Surprise me', onClick: () => {
    const s = surprise();
    store.update(p => { setChordList(p, chordsFromText(s.syms.join(' ')).chords); p.key = s.prog.minor ? s.root + ':m' : String(s.root); }, 'surprise');
    store.select(store.project.chords[0] ? store.project.chords[0].id : null);
    toast(`${s.prog.name} in ${KEY_NAMES[s.root]}${s.prog.minor ? ' minor' : ''}.`, { action: 'Undo', onAction: () => store.undo() });
    app.goToChord(0);
  } });

  pane.append(
    picker.el,
    h('div', null, h('label', { for: 'tempo', text: 'Tempo (beats per minute)' }), h('div', { class: 'tempo-row' },
      h('div', { class: 'stepper' },
        h('button', { class: 'ghost', type: 'button', 'aria-label': 'Slower', text: '−', onClick: step(-2) }), tempo,
        h('button', { class: 'ghost', type: 'button', 'aria-label': 'Faster', text: '+', onClick: step(2) })), tap)),
    h('div', { class: 'row' },
      h('div', null, h('label', { for: 'beats', text: 'Beats per chord' }), beats),
      h('div', null, h('label', { for: 'key', text: 'Key' }), key)),
    h('div', null, h('div', { class: 'gh', text: 'Quick changes' }), h('div', { class: 'btns' },
      h('div', { class: 'stepper tp' },
        h('button', { class: 'ghost', type: 'button', 'aria-label': 'Transpose down one step', text: '−', onClick: transposeBy(-1) }), keyLabel,
        h('button', { class: 'ghost', type: 'button', 'aria-label': 'Transpose up one step', text: '+', onClick: transposeBy(1) })),
      surpriseBtn)),
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
      if (r.error) { textErr.textContent = r.error; return; }
      if (r.bad.length) { textErr.textContent = `Not a chord: ${r.bad.slice(0, 4).join(', ')}. Use names like C, Am7, F#m or G/B.`; return; }
      textErr.textContent = ''; ownText = true;
      store.update(p => { setChordList(p, r.chords); }, 'chords:text');
      ownText = false;
    }, 450);
  });

  function render() {
    const p = store.project;
    if (document.activeElement !== tempo) tempo.value = String(p.tempo);
    beats.value = String(p.beatsPerChord);
    if (beats.value !== String(p.beatsPerChord)) { beats.append(opt(p.beatsPerChord, String(p.beatsPerChord), true)); }
    key.value = p.key;
    keyLabel.textContent = /^\d+(:m)?$/.test(p.key) ? `Key ${FLAT[parseInt(p.key, 10)]}${p.key.endsWith(':m') ? 'm' : ''}` : 'Transpose';
    if (!ownText && document.activeElement !== text) { text.value = chordsToText(p.chords); textErr.textContent = ''; }
  }
  store.subscribe(why => { if (!why.tag.startsWith('mix:')) render(); });
  render();
  return { highlight: strip.highlight };
}
