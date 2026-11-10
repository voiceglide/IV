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
    const setBusy = on => { app.setBusy(on); list.querySelectorAll('button').forEach(b => { b.disabled = on; }); progress.hidden = !on; };
    const onStatus = (text, p) => { status.textContent = text; progress.classList.toggle('wait', p < 0); bar.style.width = p < 0 ? '8%' : Math.max(4, Math.round(p * 100)) + '%'; };
    const fail = (what, e) => { status.textContent = ''; toast(`${what} failed: ${e && e.message || e}. Nothing was lost; you can try again.`, { error: true }); };

    function showVideo() {
      if (!video) { result.hidden = true; return; }
      const v = video, vid = h('video', { controls: true, playsInline: true, src: v.url, 'aria-label': 'Exported video' });
      const share = canShare(v.blob, v.name) ? h('button', { class: 'big ghost', type: 'button', text: 'Share…', onClick: async () => { if (!await shareBlob(v.blob, v.name, APP_NAME)) toast('Sharing did not work here. Use Save video instead.', { error: true }); } }) : null;
      result.replaceChildren(vid, h('div', { class: 'btns' },
        h('button', { class: 'big pink', type: 'button', text: 'Save video', onClick: () => { saveBlob(v.blob, v.name); toast('Saving… If nothing happens, press and hold the video and choose Save.'); } }), share));
      result.hidden = false;
    }
    const item = (title, sub, fn) => h('button', { class: 'ld', type: 'button', onClick: fn }, h('span', null, h('b', { text: title }), h('small', { text: sub })), h('i', { html: ICON.download }));

    list.append(
      item('Video', 'MP4, vertical 1080 × 1920, one seamless loop with sound', async () => {
        setBusy(true);
        try {
          const out = await exportVideo({ song, renderer: app.renderer, engine: app.engine, onStatus });
          if (video) URL.revokeObjectURL(video.url);
          video = { blob: out.blob, name: `${base}.${out.ext}`, url: URL.createObjectURL(out.blob) };
          status.textContent = `Video ready · ${(out.blob.size / 1048576).toFixed(1)} MB · ${out.desc}.`; showVideo();
        } catch (e) { fail('The video export', e); } finally { setBusy(false); app.redraw(); }
      }),
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
    openSheet({ title: 'Export', id: 'exportSheet', body: [list, progress, status, result], canClose: () => { if (app.busy()) { toast('Please wait for the export to finish.'); return false; } return true; } });
    showVideo();
  }
  document.getElementById('exportBtn').addEventListener('click', open);
  return { open };
}
