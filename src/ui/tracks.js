// The Sound tab: the sound of the gliding voices as tiles first; the mixer (one row per track) is folded under "Advanced".
import { h } from './dom.js';
import { TRACK_IDS, TRACK_LABEL, BASS_PATTERNS, DRUM_PATTERNS } from '../core/project.js';
import { CHORD_INSTRUMENTS } from '../audio/instruments/index.js';
import { GLIDES as GLIDE_SOUNDS } from '../audio/glides.js';

const GLIDES = [[0.16, 'Short glide'], [0.26, 'Medium glide'], [0.42, 'Long glide']];
const opt = (value, text) => h('option', { value: String(value), text });

export function initTracks(app) {
  const { store } = app, pane = document.getElementById('paneTracks');
  /** @type {Record<string, any>} */ const ui = {};

  const choice = {
    voices: () => h('select', { 'aria-label': 'Glide length', onChange: e => store.update(p => { p.glide = +e.target.value; }, 'sound:glide') }, GLIDES.map(([v, t]) => opt(v, t))),
    chords: () => h('select', { 'aria-label': 'Chord instrument', onChange: e => { store.update(p => { p.tracks.chords.instrument = e.target.value; }, 'sound:chords'); app.previewSound(); } },
      opt('none', 'No extra layer'), CHORD_INSTRUMENTS.map(i => opt(i.id, i.name))),
    bass: () => h('select', { 'aria-label': 'Bass pattern', onChange: e => { store.update(p => { p.tracks.bass.pattern = e.target.value; }, 'sound:bass'); app.previewSound(); } },
      Object.entries(BASS_PATTERNS).map(([v, t]) => opt(v, t))),
    drums: () => h('select', { 'aria-label': 'Drum pattern', onChange: e => { store.update(p => { p.tracks.drums.pattern = e.target.value; }, 'sound:drums'); app.previewSound(); } },
      Object.entries(DRUM_PATTERNS).map(([v, t]) => opt(v, t))),
    melody: () => h('select', { 'aria-label': 'Melody instrument', onChange: e => store.update(p => { p.tracks.melody.instrument = e.target.value; }, 'sound:melody') },
      CHORD_INSTRUMENTS.map(i => opt(i.id, i.name))),
  };

  // the sound of the gliding voices: the main choice, as tiles
  const tiles = GLIDE_SOUNDS.map(g => h('button', { class: 'tile', type: 'button', 'data-glide': g.id, onClick: () => {
    store.update(p => { p.tracks.voices.sound = g.id; }, 'sound:glide'); app.previewSound();
  } }, h('b', { text: g.name }), h('small', { text: g.hint })));
  const advanced = h('details', { class: 'more advanced' }, h('summary', { text: 'Advanced: instruments, volume and balance' }));
  pane.append(h('div', null, h('div', { class: 'gh', text: 'Sound of the gliding voices' }), h('div', { class: 'tiles', role: 'group', 'aria-label': 'Sound of the gliding voices' }, tiles)), advanced);

  for (const id of TRACK_IDS) {
    const name = TRACK_LABEL[id];
    const sel = choice[id]();
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': `${name} volume`,
      onInput: e => store.update(p => { p.tracks[id].volume = +e.target.value; }, `mix:vol:${id}`) });
    const pan = h('input', { type: 'range', min: -1, max: 1, step: 0.1, 'aria-label': `${name} balance, left to right`,
      onInput: e => store.update(p => { p.tracks[id].pan = Math.abs(+e.target.value) < 0.05 ? 0 : +e.target.value; }, `mix:pan:${id}`) });
    const mute = h('button', { class: 'tog', type: 'button', text: 'Mute', 'aria-label': `Mute ${name}`, onClick: () => store.update(p => { p.tracks[id].mute = !p.tracks[id].mute; }, 'mix:mute') });
    const solo = h('button', { class: 'tog', type: 'button', text: 'Only this', 'aria-label': `Solo ${name}`, onClick: () => store.update(p => { p.tracks[id].solo = !p.tracks[id].solo; }, 'mix:solo') });
    const strip = h('div', { class: 'mix', role: 'group', 'aria-label': name },
      h('div', { class: 'srow' }, h('b', { text: name }), sel),
      h('div', { class: 'srow' }, h('span', { class: 'cap', text: 'Volume' }), vol),
      h('div', { class: 'srow' }, h('span', { class: 'cap', text: 'Balance' }), pan),
      h('div', { class: 'srow' }, mute, solo));
    ui[id] = { sel, vol, pan, mute, solo, strip };
    advanced.append(strip);
  }

  function render() {
    const p = store.project, t = p.tracks;
    const value = { voices: String(p.glide), chords: t.chords.instrument, bass: t.bass.pattern, drums: t.drums.pattern, melody: t.melody.instrument };
    for (const id of TRACK_IDS) {
      const u = ui[id];
      if (id === 'voices' && !GLIDES.some(([v]) => String(v) === value.voices)) u.sel.append(opt(p.glide, `Glide ${p.glide} s`));
      u.sel.value = value[id];
      if (document.activeElement !== u.vol) u.vol.value = String(t[id].volume);
      if (document.activeElement !== u.pan) u.pan.value = String(t[id].pan);
      u.mute.setAttribute('aria-pressed', String(t[id].mute)); u.solo.setAttribute('aria-pressed', String(t[id].solo));
      const silent = id === 'chords' ? t.chords.instrument === 'none' : id === 'bass' ? t.bass.pattern === 'off' : id === 'drums' ? t.drums.pattern === 'off' : id === 'melody' ? !t.melody.notes.length : false;
      u.strip.classList.toggle('idle', silent);
    }
    ui.melody.strip.hidden = !app.features.melody;
    for (const el of tiles) el.setAttribute('aria-pressed', String(el.dataset.glide === (t.voices.sound || 'pad')));
  }
  store.subscribe(render); render();
}
