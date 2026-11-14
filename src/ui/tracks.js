// The Sound tab (id "Tracks" in the code): ready-made scenes first, then the sound of the gliding voices as tiles.
// Everything else is folded under "Advanced": a sound for each group of voices, how the glide moves, and the mixer.
import { h } from './dom.js';
import { TRACK_IDS, BASS_PATTERNS, DRUM_PATTERNS, GLIDE_CURVES } from '../core/project.js';
import { CHORD_INSTRUMENTS } from '../audio/instruments/index.js';
import { GLIDES as GLIDE_SOUNDS } from '../audio/glides/index.js';
import { SCENES, applyScene, currentScene } from '../core/scenes.js';

const GLIDES = [[0.16, 'Short glide'], [0.26, 'Medium glide'], [0.42, 'Long glide']];
const CURVES = { straight: 'Straight', eased: 'Smooth', scoop: 'Scoop' };
const CURVE_HINT = { straight: 'Each voice slides at an even pace.', eased: 'Each voice starts and ends gently.', scoop: 'Each voice dips under the note, then rises onto it.' };
/** Names a newcomer understands (the project data keeps its own labels). */
const LABEL = { voices: 'Gliding voices', chords: 'Chord layer', bass: 'Bass', drums: 'Drums', melody: 'Melody' };
const HELP = {
  voices: 'The main sound. Pick it with the tiles above.',
  chords: 'An extra instrument that plays each chord too.',
  bass: 'A bass line under the chords.',
  drums: 'A beat. Off by default.',
  melody: 'Your own tune from the Melody tab.',
};
const GROUPS = [['bass', 'Bass voice', 'The lowest note of each chord.'], ['inner', 'Inner voices', 'The notes in the middle.'], ['top', 'Top voice', 'The highest note: the one you hear as the tune.']];
const opt = (value, text) => h('option', { value: String(value), text });

export function initTracks(app) {
  const { store } = app, pane = document.getElementById('paneTracks');
  /** @type {Record<string, any>} */ const ui = {};
  const soundName = id => (GLIDE_SOUNDS.find(g => g.id === id) || GLIDE_SOUNDS[0]).name;

  const choice = {
    chords: () => h('select', { 'aria-label': 'Chord instrument', onChange: e => { store.update(p => { p.tracks.chords.instrument = e.target.value; }, 'sound:chords'); app.previewSound(); } },
      opt('none', 'None (just the voices)'), CHORD_INSTRUMENTS.map(i => opt(i.id, i.name))),
    bass: () => h('select', { 'aria-label': 'Bass pattern', onChange: e => { store.update(p => { p.tracks.bass.pattern = e.target.value; }, 'sound:bass'); app.previewSound(); } },
      Object.entries(BASS_PATTERNS).map(([v, t]) => opt(v, t))),
    drums: () => h('select', { 'aria-label': 'Drum pattern', onChange: e => { store.update(p => { p.tracks.drums.pattern = e.target.value; }, 'sound:drums'); app.previewSound(); } },
      Object.entries(DRUM_PATTERNS).map(([v, t]) => opt(v, t))),
    melody: () => h('select', { 'aria-label': 'Melody instrument', onChange: e => store.update(p => { p.tracks.melody.instrument = e.target.value; }, 'sound:melody') },
      CHORD_INSTRUMENTS.map(i => opt(i.id, i.name))),
  };

  // ---- scenes: one tap sets the whole sound
  const sceneTiles = SCENES.map(s => h('button', { class: 'tile scene', type: 'button', 'data-scene': s.id, onClick: () => {
    store.update(p => applyScene(p, s), ''); app.previewSound();
  } }, h('b', { text: s.name }), h('small', { text: s.hint })));

  // ---- the main sound of the gliding voices, as tiles
  const tiles = GLIDE_SOUNDS.map(g => h('button', { class: 'tile', type: 'button', 'data-glide': g.id, onClick: () => {
    store.update(p => { p.tracks.voices.sound = g.id; }, 'sound:glide'); app.previewSound();
  } }, h('b', { text: g.name }), h('small', { text: g.hint })));

  // ---- Advanced: a sound for each group of voices
  /** Play one group of the current chord (the selected one, or the first) in a sound. Does nothing while the loop plays: it is heard there. */
  function hear(group, soundId) {
    const song = app.song(); if (!song || app.engine.playing || app.busy()) return;
    const at = Math.max(0, store.selectedIndex()), v = song.v[song.n + Math.min(at, song.n - 1)] || song.v[0];
    const top = Math.max(...v.upper), inner = v.upper.filter(m => m !== top);
    const notes = group === 'bass' ? [v.bass] : group === 'top' ? [top] : (inner.length ? inner : [top]);
    try { app.engine.auditionNotes(notes, soundId || store.project.tracks.voices.sound); } catch (e) { /* no sound available: the picker still works */ }
  }
  const groupUi = {};
  const voiceRows = GROUPS.map(([key, name, help]) => {
    const sel = h('select', { 'aria-label': `${name}: sound`, onChange: e => {
      const v = e.target.value || null;
      store.update(p => { p.tracks.voices.split[key] = v; }, 'sound:split:' + key);
      hear(key, v);
    } }, opt('', 'Same as main'), GLIDE_SOUNDS.map(g => opt(g.id, g.name)));
    const btn = h('button', { class: 'tog hear', type: 'button', text: 'Hear', 'aria-label': `Hear the ${name.toLowerCase()}`, onClick: () => hear(key, sel.value) });
    groupUi[key] = sel;
    return h('div', { class: 'mix', role: 'group', 'aria-label': name }, h('div', { class: 'srow' }, h('b', { text: name }), sel, btn), h('p', { class: 'note', text: help }));
  });
  const voicesSection = h('section', { class: 'sect', 'aria-label': 'Voices' }, h('div', { class: 'gh', text: 'A different sound for each voice' }),
    h('p', { class: 'note', text: 'Leave these on "Same as main" for one sound, or mix them: a cello for the bass and a whistle on top.' }), voiceRows);

  // ---- Advanced: how the voices glide
  const curveBtns = GLIDE_CURVES.map(c => h('button', { class: 'tog curve', type: 'button', 'data-curve': c, text: CURVES[c], onClick: () => store.update(p => { p.glideStyle.curve = c; }, 'sound:style') }));
  const curveNote = h('p', { class: 'note' });
  const lenSel = h('select', { 'aria-label': 'Glide length', onChange: e => store.update(p => { p.glide = +e.target.value; }, 'sound:glide') }, GLIDES.map(([v, t]) => opt(v, t)));
  const slider = (label, key) => {
    const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, 'aria-label': label, onChange: e => store.update(p => { p.glideStyle[key] = +e.target.value; }, 'sound:style') });
    return { input, row: h('div', { class: 'stack' }, h('span', { class: 'cap', text: label }), input) };
  };
  const vib = slider('Vibrato when it lands', 'vibrato'), swell = slider('Swell on each change', 'swell');
  const feel = h('section', { class: 'sect mix', 'aria-label': 'How the voices glide' }, h('div', { class: 'gh', text: 'How the voices glide' }),
    h('div', { class: 'srow' }, h('span', { class: 'cap', text: 'Glide length' }), lenSel),
    h('div', { class: 'srow', role: 'group', 'aria-label': 'Glide curve' }, h('span', { class: 'cap', text: 'Curve' }), curveBtns), curveNote, vib.row, swell.row);

  // ---- Advanced: the mixer, one row per track
  const mixer = h('section', { class: 'sect', 'aria-label': 'Instruments and mix' }, h('div', { class: 'gh', text: 'Instruments, volume and balance' }));
  for (const id of TRACK_IDS) {
    const name = LABEL[id];
    const sel = id === 'voices' ? h('span', { class: 'main-name' }) : choice[id]();
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': `${name} volume`,
      onInput: e => store.update(p => { p.tracks[id].volume = +e.target.value; }, `mix:vol:${id}`) });
    const pan = h('input', { type: 'range', min: -1, max: 1, step: 0.1, 'aria-label': `${name} balance, left to right`,
      onInput: e => store.update(p => { p.tracks[id].pan = Math.abs(+e.target.value) < 0.05 ? 0 : +e.target.value; }, `mix:pan:${id}`) });
    const mute = h('button', { class: 'tog', type: 'button', text: 'Mute', 'aria-label': `Mute ${name}`, onClick: () => store.update(p => { p.tracks[id].mute = !p.tracks[id].mute; }, 'mix:mute') });
    const solo = h('button', { class: 'tog', type: 'button', text: 'Only this', 'aria-label': `Solo ${name}`, onClick: () => store.update(p => { p.tracks[id].solo = !p.tracks[id].solo; }, 'mix:solo') });
    const note = h('p', { class: 'note', text: HELP[id] });
    const strip = h('div', { class: 'mix', role: 'group', 'aria-label': name },
      h('div', { class: 'srow' }, h('b', { text: name }), sel),
      note,
      h('div', { class: 'srow' }, h('span', { class: 'cap', text: 'Volume' }), vol),
      h('div', { class: 'srow' }, h('span', { class: 'cap', text: 'Balance' }), pan),
      h('div', { class: 'srow' }, mute, solo));
    ui[id] = { sel, vol, pan, mute, solo, strip, note };
    mixer.append(strip);
  }
  // Marked slot for the drum designer (drums.js): empty until that module puts its controls here.
  const drumsSlot = h('section', { class: 'sect', id: 'drumsSection', 'data-slot': 'drums', 'aria-label': 'Drums' });

  const advanced = h('details', { class: 'more advanced' }, h('summary', { text: 'Advanced: each voice, glide feel, instruments and mix' }), voicesSection, feel, mixer, drumsSlot);
  pane.append(
    h('div', null, h('div', { class: 'gh', text: 'Start from a scene' }), h('p', { class: 'note', text: 'One tap sets the whole sound. You can still change anything after.' }),
      h('div', { class: 'tiles', role: 'group', 'aria-label': 'Scenes' }, sceneTiles)),
    h('div', null, h('div', { class: 'gh', text: 'Main sound of the voices' }), h('div', { class: 'tiles', role: 'group', 'aria-label': 'Sound of the gliding voices' }, tiles)),
    advanced);

  function render() {
    const p = store.project, t = p.tracks;
    const value = { chords: t.chords.instrument, bass: t.bass.pattern, drums: t.drums.pattern, melody: t.melody.instrument };
    for (const id of TRACK_IDS) {
      const u = ui[id];
      if (id === 'voices') u.sel.textContent = soundName(t.voices.sound); else u.sel.value = value[id];
      if (document.activeElement !== u.vol) u.vol.value = String(t[id].volume);
      if (document.activeElement !== u.pan) u.pan.value = String(t[id].pan);
      u.mute.setAttribute('aria-pressed', String(t[id].mute)); u.solo.setAttribute('aria-pressed', String(t[id].solo));
      const silent = id === 'chords' ? t.chords.instrument === 'none' : id === 'bass' ? t.bass.pattern === 'off' : id === 'drums' ? t.drums.pattern === 'off' : id === 'melody' ? !t.melody.notes.length : false;
      u.strip.classList.toggle('idle', silent);
      u.note.textContent = silent && id !== 'voices' ? ({ chords: 'Off. Pick an instrument to add it.', bass: 'Off. Pick a pattern to add a bass line.', drums: 'Off. Pick a beat to add drums.', melody: 'Nothing yet. Add notes in the Melody tab.' })[id] : HELP[id];
    }
    ui.melody.strip.hidden = !app.features.melody;
    if (!lenSel.querySelector(`option[value="${p.glide}"]`)) { for (const o of lenSel.querySelectorAll('.custom')) o.remove(); const o = opt(p.glide, `Custom (${p.glide} s)`); o.className = 'custom'; lenSel.append(o); }
    lenSel.value = String(p.glide);
    for (const [k, sel] of Object.entries(groupUi)) sel.value = t.voices.split[k] || '';
    for (const b of curveBtns) b.setAttribute('aria-pressed', String(b.dataset.curve === p.glideStyle.curve));
    curveNote.textContent = CURVE_HINT[p.glideStyle.curve];
    if (document.activeElement !== vib.input) vib.input.value = String(p.glideStyle.vibrato);
    if (document.activeElement !== swell.input) swell.input.value = String(p.glideStyle.swell);
    for (const el of tiles) el.setAttribute('aria-pressed', String(el.dataset.glide === (t.voices.sound || 'pad')));
    const cur = currentScene(p);
    for (const el of sceneTiles) el.setAttribute('aria-pressed', String(!!cur && el.dataset.scene === cur.id));
  }
  store.subscribe(render); render();
}
