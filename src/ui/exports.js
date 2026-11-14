// The Export sheet: video, audio, MIDI and the project file.
import { h, ICON } from './dom.js';
import { openSheet, toast } from './sheet.js';
import { saveBlob, canShare, shareBlob } from './files.js';
import { exportVideo } from '../export/video.js';
import { renderLoop } from '../audio/engine.js';
import { encodeWav } from '../core/wav.js';
import { songToMidi } from '../core/midiexport.js';
import { serializeProject, fileBase } from '../core/project.js';
import { INSTRUMENTS } from '../audio/instruments/index.js';
import { APP_NAME } from '../config.js';

const PREF_KEY = 'iv.export.look';
const FORMATS = [['9:16', 'Vertical', '9:16'], ['1:1', 'Square', '1:1'], ['16:9', 'Wide', '16:9']];
const LOOKS = [['paper', 'Paper'], ['night', 'Night']];
const DEFAULTS = { ratio: '9:16', theme: 'paper' };
const SIZES = { '9:16': '1080 × 1920', '1:1': '1080 × 1080', '16:9': '1920 × 1080' };

/** The remembered Format and Look; anything unreadable or unknown falls back to the defaults. */
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {};
    return { ratio: FORMATS.some(f => f[0] === p.ratio) ? p.ratio : DEFAULTS.ratio, theme: LOOKS.some(l => l[0] === p.theme) ? p.theme : DEFAULTS.theme };
  } catch (e) { return { ...DEFAULTS }; }
}
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private window: the choice lasts until the page closes */ } }

/** A small radio group drawn as joined buttons. */
function picker(label, name, options, value, onPick) {
  const inputs = options.map(([v, text, sub]) => ({ v, el: h('input', { type: 'radio', name, value: v, checked: v === value, onChange: () => onPick(v) }),
    text, sub }));
  const group = h('div', { class: 'xseg', role: 'radiogroup', 'aria-label': label },
    inputs.map(i => h('label', null, i.el, h('span', null, h('b', { text: i.text }), i.sub ? h('small', { text: i.sub }) : null))));
  return { el: h('div', { class: 'xpick' }, h('div', { class: 'xlabel', text: label }), group), inputs: inputs.map(i => i.el) };
}

export function initExports(app) {
  /** @type {{blob:Blob, name:string, url:string}|null} */ let video = null;

  function open() {
    const song = app.song();
    if (!song) { toast('Add at least one chord before exporting.', { error: true }); return; }
    app.stop();
    const base = fileBase(app.store.project);
    const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    const bar = h('i'), progress = h('div', { class: 'progress', hidden: true }, bar);
    const result = h('div', { class: 'stack', hidden: true });
    const list = h('div', { class: 'stack' });
    /** @type {AbortController|null} */ let job = null; // the running video export, if any
    const prefs = loadPrefs();
    const fmt = picker('Format', 'xfmt', FORMATS, prefs.ratio, v => { prefs.ratio = v; savePrefs(prefs); });
    const look = picker('Look', 'xlook', LOOKS, prefs.theme, v => { prefs.theme = v; savePrefs(prefs); });
    const cancel = h('button', { class: 'big ghost', type: 'button', text: 'Cancel', hidden: true, onClick: () => { if (job) { job.abort(); status.textContent = 'Cancelling…'; } } });
    const setBusy = on => {
      app.setBusy(on); progress.hidden = !on; cancel.hidden = !(on && job);
      for (const b of [...list.querySelectorAll('button'), ...more.querySelectorAll('button'), ...fmt.inputs, ...look.inputs]) b.disabled = on;
    };
    const onStatus = (text, p) => { status.textContent = text; progress.classList.toggle('wait', p < 0); bar.style.width = p < 0 ? '8%' : Math.max(4, Math.round(p * 100)) + '%'; };
    const fail = (what, e) => { status.textContent = ''; toast(`${what} did not work: ${String(e && e.message || e).replace(/\.$/, '')}. Nothing was lost; you can try again.`, { error: true }); };

    function showVideo() {
      if (!video) { result.hidden = true; return; }
      const v = video, vid = h('video', { controls: true, playsInline: true, src: v.url, 'aria-label': 'Exported video' });
      const share = canShare(v.blob, v.name) ? h('button', { class: 'big ghost', type: 'button', text: 'Share…', onClick: async () => { if (!await shareBlob(v.blob, v.name, APP_NAME)) toast('Sharing did not work here. Use Download video instead.', { error: true }); } }) : null;
      // the buttons come first and the preview after them, so the file can be saved without scrolling on a small phone
      result.replaceChildren(h('div', { class: 'btns' },
        h('button', { class: 'big pink', type: 'button', text: 'Download video', onClick: () => { saveBlob(v.blob, v.name); toast('Saving… If nothing happens, press and hold the video and choose Save.'); } }), share), vid);
      result.hidden = false;
    }
    const item = (title, sub, fn) => h('button', { class: 'ld', type: 'button', onClick: fn }, h('span', null, h('b', { text: title }), h('small', { text: sub })), h('i', { html: ICON.download }));

    const saveVideo = h('button', { class: 'big pink xsave', type: 'button', text: 'Save video', onClick: async () => {
      job = new AbortController(); setBusy(true);
      try {
        const out = await exportVideo({ song, engine: app.engine, onStatus, signal: job.signal, ratio: prefs.ratio, theme: prefs.theme });
        if (video) URL.revokeObjectURL(video.url);
        video = { blob: out.blob, name: `${base}.${out.ext}`, url: URL.createObjectURL(out.blob) };
        status.textContent = `Video ready · ${(out.blob.size / 1048576).toFixed(1)} MB · ${out.desc}.`; showVideo();
      } catch (e) {
        if (e && e.name === 'AbortError') status.textContent = 'Export cancelled. Nothing was saved.';
        else fail('The video export', e);
      } finally { job = null; setBusy(false); app.redraw(); }
    } });
    list.append(
      item('Audio', 'WAV, 48 kHz stereo, one seamless loop', async () => {
        setBusy(true); onStatus('Rendering audio…', -1);
        try {
          const buf = await renderLoop(song, 48000);
          saveBlob(new Blob([encodeWav([buf.getChannelData(0), buf.getChannelData(1)], 48000)], { type: 'audio/wav' }), `${base}.wav`);
          status.textContent = 'Audio saved to your downloads.';
        } catch (e) { fail('The audio export', e); } finally { setBusy(false); }
      }),
      item('MIDI', 'Notes of every track, to open in another music app', () => {
        try {
          saveBlob(new Blob([songToMidi(song, id => (INSTRUMENTS[id] ? INSTRUMENTS[id].style : 'block'))], { type: 'audio/midi' }), `${base}.mid`);
          status.textContent = 'MIDI file saved to your downloads.';
        } catch (e) { fail('The MIDI export', e); }
      }),
      item('Project file', 'A .json backup you can open again here, on any device', () => {
        saveBlob(new Blob([serializeProject(app.store.project)], { type: 'application/json' }), `${base}.json`);
        status.textContent = 'Project file saved to your downloads.';
      }));
    const more = h('details', { class: 'xmore' }, h('summary', { text: 'More: audio, MIDI, project file' }), list);
    const note = h('p', { class: 'xnote', text: 'An MP4 with sound: one seamless loop of your progression.' });
    const chosen = () => { note.textContent = `An MP4 with sound, ${SIZES[prefs.ratio]}: one seamless loop of your progression.`; };
    chosen(); for (const i of [...fmt.inputs, ...look.inputs]) i.addEventListener('change', chosen);
    openSheet({ title: 'Export', id: 'exportSheet', body: [fmt.el, look.el, saveVideo, note, progress, cancel, status, result, more],
      // closing the sheet while a video is being made cancels it; the quick exports (audio) are not worth interrupting
      canClose: () => { if (!app.busy()) return true; if (job) { job.abort(); return true; } toast('Please wait for the export to finish.'); return false; } });
    showVideo();
  }
  document.getElementById('exportBtn').addEventListener('click', open);
  return { open };
}
