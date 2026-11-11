// Entry point: creates the engine, the renderer and the store, and wires the main screen.
// Audio lives in audio/, drawing in render/, data in core/: this file only connects them to the page.
import { $, ICON } from './dom.js';
import { createStore } from './store.js';
import { toast, sheetOpen } from './sheet.js';
import { initChords } from './chords.js';
import { initTracks } from './tracks.js';
import { initTextPane } from './textpane.js';
import { initMelody } from './melody.js';
import { initExports } from './exports.js';
import { initMenu } from './menu.js';
import { initProjects } from './projects.js';
import { initFeedback } from './feedback.js';
import { initPwa } from './pwa.js';
import { initWelcome } from './welcome.js';
import { createEngine } from '../audio/engine.js';
import { createRenderer } from '../render/draw.js';
import { buildSong, idxAt } from '../core/song.js';
import { exampleProject } from '../core/project.js';
import { blockVoicing } from '../core/theory.js';
import { APP_NAME } from '../config.js';
import * as lab from './lab.js';

const store = createStore();
const engine = createEngine();
const renderer = createRenderer($('cv'));
/** @type {any} */ let song = null;
let dirty = true, busy = false;
const scrub = $('scrub');

document.title = APP_NAME;
$('undoBtn').innerHTML = ICON.undo; $('redoBtn').innerHTML = ICON.redo; $('menuBtn').innerHTML = ICON.more;
$('editBtn').querySelector('.ico').innerHTML = ICON.edit;

// ---------------------------------------------------------------- playback
function stop() { engine.stop(); }
function play(from) {
  if (!song || busy) return;
  try { engine.play(song, from); } catch (e) { toast(`Sound could not start: ${e && /** @type {any} */(e).message || e}`, { error: true }); }
}
function togglePlay() {
  if (busy) return;
  if (engine.playing) { stop(); return; }
  if (!song) { toast('Add a chord first: tap Edit, then Add.'); return; }
  const at = +scrub.value; play(at >= song.vs && at < song.ve - 0.05 ? at : song.vs);
}

// ---------------------------------------------------------------- project → song
/** Where a moment of the old song falls in the new one: same chord, same fraction of it. */
function mapTime(old, t, next) {
  if (!old || t < old.vs || t > old.ve) return next.starts[next.n];
  const i = idxAt(old, t), end = i + 1 < old.starts.length ? old.starts[i + 1] : old.end, frac = (t - old.starts[i]) / (end - old.starts[i]);
  const k = Math.min(next.n - 1, i % old.n) + next.n, kEnd = next.starts[k + 1] !== undefined ? next.starts[k + 1] : next.end;
  return Math.max(next.vs, Math.min(next.ve - 0.05, next.starts[k] + frac * (kEnd - next.starts[k])));
}
function rebuild(why) {
  const tag = why.kind === 'edit' ? why.tag : '';
  const wasAt = engine.playing ? engine.time() : null, old = song;
  if (tag.startsWith('mix:') && song) { song.tracks = store.project.tracks; engine.setMix(song.tracks); return; }
  const r = buildSong(store.project);
  song = r.song; $('songErr').textContent = r.error;
  if (song) {
    scrub.min = song.vs.toFixed(2); scrub.max = song.ve.toFixed(2);
    // at rest the preview shows the first chord, not the glide that leads into it; after an edit it stays on the same chord
    scrub.value = String(why.kind === 'open' ? Math.min(song.ve, song.starts[song.n]) : mapTime(old, +scrub.value, song));
  }
  scrub.disabled = !song; dirty = true;
  if (why.kind === 'open' || !song) { stop(); return; }
  if (wasAt === null) return;
  // text on the video and melody notes do not touch what is sounding now: they are picked up when the loop comes round
  if (tag.startsWith('text:') || tag.startsWith('melody')) return;
  // everything else is heard at once, from the same place: the loop never jumps back to its start
  play(mapTime(old, wasAt, song));
}
function syncHead() {
  $('projName').textContent = store.project.name;
  $('undoBtn').disabled = !store.canUndo(); $('redoBtn').disabled = !store.canRedo();
}

// ---------------------------------------------------------------- the app object handed to every UI module
const app = {
  store, engine, renderer,
  features: { melody: true },
  song: () => song,
  stop, play, togglePlay,
  busy: () => busy,
  /** Long jobs (exports) take over the canvas and the engine. */
  setBusy(on) { busy = on; if (on) stop(); dirty = true; },
  redraw() { dirty = true; },
  /** Jump to chord i of the loop: the preview shows it, and it is heard (the loop continues from there if it is playing). */
  goToChord(i) {
    if (!song || busy) return;
    const k = song.n + Math.max(0, Math.min(song.n - 1, i)), t = song.starts[k];
    scrub.value = String(t); dirty = true;
    if (engine.playing) { play(t); return; }
    try { engine.auditionVoices(song, k); } catch (e) { /* no sound available: the preview still moves */ }
  },
  /** Play one chord right now, so a choice in the chord picker can be heard. */
  audition(chord) {
    if (busy || engine.playing) return;
    const v = blockVoicing(chord), id = store.project.tracks.chords.instrument;
    void id; try { engine.auditionNotes([v.bass, ...v.upper], store.project.tracks.voices.sound); } catch (e) { /* no sound available: the picker still works */ }
  },
  /** After a sound choice: start the loop if it is not playing, so the change is heard. */
  previewSound() { if (!engine.playing && song && !busy) play(song.vs); },
  /** @type {{add:(item:{label:string, icon?:string, run:()=>void, order?:number})=>void}} */
  menu: /** @type {any} */(null),
  openHelp() {},
  setEditOpen,
};

// ---------------------------------------------------------------- edit panel and tabs
const TABS = ['Chords', 'Tracks', 'Melody', 'Text'];
function selectTab(name) {
  for (const t of TABS) {
    const on = t === name, tab = $('tab' + t);
    tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; $('pane' + t).hidden = !on;
  }
  $('edit').classList.toggle('tall', name === 'Melody');
}
function setEditOpen(open, tab) {
  $('edit').hidden = !open; $('editBtn').setAttribute('aria-expanded', String(open));
  if (tab) selectTab(tab);
  dirty = true;
}
TABS.forEach(t => $('tab' + t).addEventListener('click', () => selectTab(t)));
document.querySelector('.tabs').addEventListener('keydown', e => {
  const k = /** @type {KeyboardEvent} */(e).key; if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
  const live = TABS.filter(t => !$('tab' + t).hidden), i = live.findIndex(t => $('tab' + t).getAttribute('aria-selected') === 'true');
  const next = live[(i + (k === 'ArrowRight' ? 1 : live.length - 1)) % live.length];
  selectTab(next); $('tab' + next).focus(); e.preventDefault();
});
$('editBtn').addEventListener('click', () => setEditOpen($('edit').hidden));

// ---------------------------------------------------------------- transport, undo, shortcuts
$('play').addEventListener('click', togglePlay);
scrub.addEventListener('input', () => { if (engine.playing) stop(); dirty = true; });
$('undoBtn').addEventListener('click', () => store.undo());
$('redoBtn').addEventListener('click', () => store.redo());
document.addEventListener('keydown', e => {
  const t = /** @type {HTMLElement} */(e.target), typing = t && (t.tagName === 'INPUT' && /** @type {HTMLInputElement} */(t).type !== 'range' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); store.redo(); return; }
  if (mod || e.altKey || typing || sheetOpen() || busy) return;
  const k = e.key.toLowerCase();
  if (e.key === ' ') { if (t && t.tagName === 'BUTTON') return; e.preventDefault(); togglePlay(); }
  else if (k === 'e') setEditOpen($('edit').hidden);
  else if (k >= '1' && k <= '4') { const live = TABS.filter(x => !$('tab' + x).hidden); if (live[+k - 1]) setEditOpen(true, live[+k - 1]); }
  else if (k === 'n') { setEditOpen(true, 'Chords'); /** @type {HTMLElement} */(document.querySelector('.chord.add')).click(); }
  else if (k === 'x') $('exportBtn').click();
  else if (k === 'p') $('projBtn').click();
  else if (e.key === '?') app.openHelp();
});

// leaving the page (tab switch, phone lock) stops the sound; coming back redraws
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (!busy) stop(); } else dirty = true; });
window.addEventListener('resize', () => { dirty = true; });

// ---------------------------------------------------------------- start
store.subscribe(why => { rebuild(why); syncHead(); });
store.open(exampleProject(0));
const m = initMenu(); app.menu = m.menu; app.openHelp = m.openHelp;
const chordsUi = initChords(app);
initTracks(app); initTextPane(app); const melodyUi = initMelody(app); initExports(app);
$('tabMelody').hidden = !app.features.melody;
initProjects(app); initFeedback(app); initPwa(app);
initWelcome(app);

let playState = '';
function frame() {
  const state = busy ? 'busy' : engine.playing ? 'stop' : 'play';
  if (state !== playState) {
    playState = state;
    const b = $('play'); b.disabled = state === 'busy';
    b.querySelector('.ico').innerHTML = state === 'stop' ? ICON.stop : ICON.play;
    b.querySelector('.lbl').textContent = state === 'stop' ? 'Stop' : 'Play';
    $('exportBtn').disabled = $('projBtn').disabled = state === 'busy';
  }
  if (!busy) {
    if (engine.playing && song) {
      let t = engine.time();
      if (t > song.ve) { play(song.vs); t = song.vs; }
      renderer.draw(song, t); scrub.value = String(t);
      chordsUi.highlight(idxAt(song, t) % song.n);
      melodyUi.playhead((t - song.vs - (song.starts[song.n] - song.vs)) / song.spb);
    } else if (dirty) {
      dirty = false; renderer.draw(song, +scrub.value);
      chordsUi.highlight(-1);
      melodyUi.playhead(-1);
    }
  }
  requestAnimationFrame(frame);
}
const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 100px Inter'), document.fonts.load('900 100px Inter')]) : Promise.resolve();
fonts.catch(() => {}).then(() => { dirty = true; });
requestAnimationFrame(frame);

// for tests and debugging only
/** @type {any} */(window).__app = Object.assign(app, { lab });
