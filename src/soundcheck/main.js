// The listening page: one tap per glide sound on the same progression, and a place to write down what to retouch.
// Built into dist/sound-check.html by scripts/build.mjs. No network: everything is in the page.
import { createEngine } from '../audio/engine.js';
import { GLIDES } from '../audio/glides/index.js';
import { newProject, normalizeProject } from '../core/project.js';
import { buildSong } from '../core/song.js';

const PROGRESSION = 'C G Am F Dm7 G7 Cmaj7 Bb', TEMPO = 84, KEY = 'sound-check-notes-v1';
const engine = createEngine();
/** @type {Record<string, string>} */
let notes = {};
try { notes = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { notes = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) { /* private window: notes stay on the page only */ } };

let current = '', curve = 'eased';
const $ = id => /** @type {HTMLElement} */(document.getElementById(id));
const tiles = /** @type {Record<string, HTMLElement>} */({});

function songFor(id) {
  const p = newProject('check', PROGRESSION); p.tempo = TEMPO;
  for (const t of Object.values(p.tracks)) t.mute = true;
  p.tracks.voices.mute = false; p.tracks.voices.sound = id; p.glideStyle.curve = /** @type {any} */(curve);
  return buildSong(normalizeProject(p)).song;
}
function show() {
  for (const id of Object.keys(tiles)) { tiles[id].classList.toggle('on', id === current); tiles[id].querySelector('button').setAttribute('aria-pressed', String(id === current)); tiles[id].querySelector('.state').textContent = id === current ? 'Playing. Tap to stop' : 'Tap to listen'; }
  /** @type {any} */(window).__sc = { current, playing: engine.playing, time: engine.time() };
}
function tap(id) {
  if (current === id) { engine.stop(); current = ''; show(); return; }
  try { const song = songFor(id); engine.play(song, song.vs, { loop: true }); current = id; } catch (e) { $('err').textContent = 'Sound could not start: ' + (e && /** @type {any} */(e).message || e); current = ''; }
  show();
}

const list = $('list');
for (const g of GLIDES) {
  const li = document.createElement('li'); li.className = 'tile';
  li.innerHTML = '<button type="button"><span class="name"></span><span class="hint"></span><span class="state"></span></button><label>Notes<textarea rows="2" placeholder="What to retouch?"></textarea></label>';
  li.querySelector('.name').textContent = g.name; li.querySelector('.hint').textContent = g.hint;
  const ta = li.querySelector('textarea'); ta.value = notes[g.id] || ''; ta.setAttribute('aria-label', 'Notes on ' + g.name);
  ta.addEventListener('input', () => { notes[g.id] = ta.value; save(); });
  li.querySelector('button').addEventListener('click', () => tap(g.id));
  tiles[g.id] = li; list.append(li);
}
for (const b of document.querySelectorAll('[data-curve]')) b.addEventListener('click', () => {
  curve = /** @type {string} */(b.getAttribute('data-curve'));
  for (const o of document.querySelectorAll('[data-curve]')) o.setAttribute('aria-pressed', String(o === b));
  if (current) { const id = current; current = ''; tap(id); }
});
$('stop').addEventListener('click', () => { engine.stop(); current = ''; show(); });
$('copy').addEventListener('click', async () => {
  const text = GLIDES.map(g => `${g.name}: ${(notes[g.id] || '').trim() || '-'}`).join('\n') + `\n(progression ${PROGRESSION}, ${TEMPO} bpm, curve ${curve})`;
  const out = /** @type {HTMLTextAreaElement} */($('all')); out.value = text; out.hidden = false;
  try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copied.'; } catch (e) { out.select(); $('copied').textContent = 'Select the text above and copy it.'; }
});
$('prog').textContent = `${PROGRESSION} · ${TEMPO} bpm`;
setInterval(show, 250);
show();

// for the automated test: a short loop played by the live engine, to see the engine loop on its own
/** @type {any} */(window).__scLab = { engine, loop(text, tempo) { const pr = newProject('t', text); pr.tempo = tempo; const song = buildSong(normalizeProject(pr)).song; engine.play(song, song.vs, { loop: true }); return { vs: song.vs, ve: song.ve }; } };
