// Video export: a clip of one seamless loop (9:16 by default; 1:1 and 16:9 too), about 30 fps, with sound.
// Preferred path: every frame is drawn and encoded one by one (H.264 + AAC or Opus in an MP4), faster or slower than
// real time, never dropping a frame, on its own canvas (the preview is not touched) and in small slices so the page stays usable.
// Where the browser has no such encoders, the canvas is recorded in real time instead (said out loud, not silently).
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { renderLoop } from '../audio/engine.js';
import { createRenderer, RATIOS } from '../render/draw.js';

const FPS = 30, SR = 48000;
// give the browser a turn (input, painting) without setTimeout's 4 ms clamp
const turn = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const nextTurn = () => new Promise(r => { if (!turn) { setTimeout(r, 0); return; } turn.port1.onmessage = () => r(undefined); turn.port2.postMessage(0); });

/** Thrown when the person cancels. */
export class ExportCancelled extends Error { constructor() { super('Export cancelled.'); this.name = 'AbortError'; } }
const check = signal => { if (signal && signal.aborted) throw new ExportCancelled(); };

/** A plain-English message for whatever went wrong inside the encoders. */
export function friendlyError(e) {
  if (e && e.name === 'AbortError') return e;
  const raw = String(e && e.message || e || ''), name = e && e.name || '';
  let msg;
  if (name === 'QuotaExceededError' || name === 'RangeError' || /memory|allocation/i.test(raw)) msg = 'This device ran out of memory while making the video. Try a shorter progression or close other tabs.';
  else if (name === 'NotSupportedError' || /unsupported|not supported/i.test(raw)) msg = 'This browser cannot encode this kind of video. Try a recent Chrome, Edge or Safari.';
  else if (/silent/i.test(raw)) msg = 'The sound track came out silent, so the video was not saved. Please try again.';
  else if (/offline audio/i.test(raw)) msg = 'This browser cannot render the sound for the video.';
  else if (/encod/i.test(raw) || name === 'EncodingError') msg = 'The video encoder stopped with an error. Please try again; if it keeps happening, try another browser.';
  else msg = raw || 'something unexpected happened';
  const out = new Error(msg); out.name = name; /** @type {any} */(out).cause = e; return out;
}

async function pickVideoConfig(W, H) {
  for (const codec of ['avc1.4d0033', 'avc1.4d0029', 'avc1.4d0028', 'avc1.640028', 'avc1.42e028']) {
    /** @type {any} */ const cfg = { codec, width: W, height: H, bitrate: 8_000_000, framerate: FPS, bitrateMode: 'variable', latencyMode: 'quality', avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { /* try the next profile */ }
  }
  return null;
}
async function pickAudioConfig() {
  if (!globalThis.AudioEncoder) return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    /** @type {any} */ const cfg = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 160000, bitrateMode: 'constant' };
    if (mux === 'aac') cfg.aac = { format: 'aac' };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux }; } catch (e) { /* try the next codec */ }
  }
  return null;
}
/** The sound track of the finished file must not be silent: loudest sample of the loop before encoding. */
function peakOf(ab) {
  let p = 0;
  for (let ch = 0; ch < ab.numberOfChannels; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < d.length; i += 7) { const v = Math.abs(d[i]); if (v > p) p = v; } }
  return p;
}
/** Loudest sample of the file's decoded sound, or null where this browser cannot decode it. Takes (and consumes) the buffer. */
async function decodedPeak(ac, buf) {
  try { return peakOf(await ac.decodeAudioData(buf)); } catch (e) { return null; }
}
/**
 * One video frame from the canvas, tagged BT.709 limited range (what players and platforms expect from HD video).
 * A frame taken straight from a canvas would be tagged full range (yuvj420p), which some players show with washed-out or crushed levels.
 */
let tagged = true;
function makeFrame(cv, timestamp, duration) {
  if (tagged) {
    try {
      const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      return new VideoFrame(px.data, { format: 'RGBA', codedWidth: cv.width, codedHeight: cv.height, timestamp, duration,
        colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false } });
    } catch (e) { tagged = false; } // this browser takes no colour tags on pixel data: use the canvas as it is
  }
  return new VideoFrame(cv, { timestamp, duration });
}
const closeQuietly = enc => { try { if (enc && enc.state !== 'closed') enc.close(); } catch (e) { /* already closed */ } };

async function exportFrames(song, o, vcfg, ainfo) {
  const { engine, onStatus, signal } = o, { w: W, h: H } = o.size;
  onStatus('Preparing…', -1);
  // the fonts must be loaded before the first frame, or the first frames would be drawn in a fallback font
  if (document.fonts && document.fonts.load) { try { await Promise.all(['700', '800', '900'].map(wt => document.fonts.load(`${wt} 100px Inter`))); await document.fonts.ready; } catch (e) { /* draw with what is there */ } }
  check(signal);
  const renderer = createRenderer(document.createElement('canvas'), { w: W, h: H, theme: o.theme });
  onStatus('Rendering audio…', -1);
  const ab = await renderLoop(song, SR);
  check(signal);
  if (peakOf(ab) < 1e-4) throw new Error('the sound track came out silent');
  // The loop lasts exactly as long as the sound (a whole number of samples). The frame count is rounded from 30 fps, then the frame rate is
  // nudged (29.9…30.1) so that frames × frame duration == loop duration, which keeps video and sound locked on every repeat.
  const D = ab.length / SR, N = Math.max(1, Math.round(D * FPS)), fdur = D / N;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: 90000 }, // frameRate is the track's time unit
    audio: { codec: ainfo.mux, numberOfChannels: 2, sampleRate: SR }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  /** @type {any} */ let fail = null;
  /** @type {{data:Uint8Array, type:string, ts:number, dur:number, meta:any}[]} */ const aOut = [];
  let gotDesc = false;
  const ASC = new Uint8Array([0x11, 0x90]); // AAC-LC, 48 kHz, stereo
  /** @type {AudioEncoder|null} */ let ae = null; /** @type {VideoEncoder|null} */ let ve = null;
  try {
    ae = new AudioEncoder({ output: (ch, m) => {
      // some browsers hand over a whole ES descriptor instead of the 2-byte AAC config, which makes the track unreadable: always use our own
      if (ainfo.mux === 'aac' && !gotDesc) { m = { decoderConfig: { codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, description: ASC } }; gotDesc = true; }
      const data = new Uint8Array(ch.byteLength); ch.copyTo(data); aOut.push({ data, type: ch.type, ts: ch.timestamp, dur: ch.duration || 0, meta: m });
    }, error: e => { fail = e; } });
    ae.configure(ainfo.cfg);
    const Lc = ab.getChannelData(0), Rc = ab.getChannelData(1), step = 4800, endS = ab.length;
    let planar = true;
    for (let i = 0; i < endS; i += step) {
      check(signal); if (fail) throw fail;
      const n = Math.min(step, endS - i), ts = Math.round(i / SR * 1e6); let ad = null;
      if (planar) {
        try { const data = new Float32Array(n * 2); data.set(Lc.subarray(i, i + n), 0); data.set(Rc.subarray(i, i + n), n);
          ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: ts, data }); } catch (e) { planar = false; }
      }
      if (!ad) { const data = new Float32Array(n * 2); for (let q = 0; q < n; q++) { data[2 * q] = Lc[i + q]; data[2 * q + 1] = Rc[i + q]; }
        ad = new AudioData({ format: 'f32', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: ts, data }); }
      ae.encode(ad); ad.close();
      while (ae.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 2));
      if ((i / step) % 20 === 19) await nextTurn();
    }
    await ae.flush(); closeQuietly(ae); if (fail) throw fail; if (!aOut.length) throw new Error('no audio was encoded');
    // drop the encoder's padding: frames that start after the loop ended; the last kept frame is cut short in the file's timing
    const endUs = Math.round(D * 1e6);
    for (const a of aOut) if (a.ts < endUs) muxer.addAudioChunkRaw(a.data, /** @type {any} */(a.type), a.ts, Math.min(a.dur, endUs - a.ts), a.meta);
    aOut.length = 0;

    ve = new VideoEncoder({ output: (ch, m) => muxer.addVideoChunk(ch, m), error: e => { fail = e; } });
    ve.configure(vcfg);
    const keyEvery = Math.round(2 * N / D);
    for (let f = 0; f < N; f++) {
      check(signal); if (fail) throw fail;
      renderer.draw(song, song.vs + f * fdur);
      const vf = makeFrame(renderer.canvas, Math.round(f * fdur * 1e6), Math.round(fdur * 1e6));
      try { ve.encode(vf, { keyFrame: f % keyEvery === 0 }); } finally { vf.close(); }
      while (ve.encodeQueueSize > 6) { check(signal); await new Promise(r => setTimeout(r, 2)); }
      if (f % 2 === 1) { if (f % 10 === 9) onStatus('Rendering video…', f / N); await nextTurn(); } // let the page breathe: no long stretch without a turn for the browser
    }
    await ve.flush(); closeQuietly(ve); if (fail) throw fail; muxer.finalize();
  } finally { closeQuietly(ae); closeQuietly(ve); }
  const buf = muxer.target.buffer;
  const blob = new Blob([buf], { type: 'video/mp4' }); // the blob keeps its own copy, so the buffer can be handed to the decoder as it is
  onStatus('Checking the sound…', -1);
  const peak = await decodedPeak(engine.unlock(), buf);
  if (peak !== null && peak < 1e-4) throw new Error('the sound track came out silent');
  return { blob, ext: 'mp4', desc: `MP4 · ${W}×${H} · ${(N / D).toFixed(2)} fps · ${ainfo.mux === 'aac' ? 'AAC' : 'Opus'} sound` };
}

function exportRealtime(song, o) {
  const { engine, onStatus, signal } = o, { w: W, h: H } = o.size;
  return new Promise((resolve, reject) => {
    const cv = document.createElement('canvas'), renderer = createRenderer(cv, { w: W, h: H, theme: o.theme });
    if (!globalThis.MediaRecorder || !cv.captureStream) { reject(new Error('This browser cannot record video. Try a recent Chrome, Edge or Safari.')); return; }
    const tap = engine.tap();
    const stream = new MediaStream([...cv.captureStream(FPS).getVideoTracks(), ...tap.stream.getAudioTracks()]);
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : {});
    /** @type {Blob[]} */ const chunks = [];
    let cancelled = false;
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = () => { tap.release(); engine.stop(); reject(new Error('The recording stopped unexpectedly.')); };
    rec.onstop = () => {
      tap.release();
      if (cancelled) { reject(new ExportCancelled()); return; }
      const type = rec.mimeType || 'video/webm', ext = type.includes('mp4') ? 'mp4' : 'webm';
      resolve({ blob: new Blob(chunks, { type }), ext, desc: `${ext.toUpperCase()} · recorded in real time` });
    };
    // the first frame is on the canvas and the sound is already playing when recording starts, so there is no silent pre-roll
    renderer.draw(song, song.vs); engine.play(song, song.vs); rec.start(500);
    const frame = () => {
      if (signal && signal.aborted) { cancelled = true; engine.stop(); if (rec.state !== 'inactive') rec.stop(); else { tap.release(); reject(new ExportCancelled()); } return; }
      const t = engine.time();
      if (!engine.playing || t > song.ve) { engine.stop(); if (rec.state !== 'inactive') rec.stop(); return; }
      renderer.draw(song, t); onStatus('Recording… keep this page open and in front.', (t - song.vs) / song.cycle);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/**
 * @param {{song:any, engine:any, onStatus:(text:string, progress:number)=>void, signal?:AbortSignal, ratio?:'9:16'|'1:1'|'16:9', theme?:string}} o
 *   progress is 0…1, or −1 when the length of the step is unknown. Rejects with an error named AbortError when cancelled.
 * @returns {Promise<{blob:Blob, ext:string, desc:string}>}
 */
export async function exportVideo({ song, engine, onStatus, signal, ratio = '9:16', theme = 'paper' }) {
  engine.stop();
  const o = { engine, onStatus, signal, theme, size: RATIOS[ratio] || RATIOS['9:16'] };
  try {
    const vcfg = globalThis.VideoEncoder ? await pickVideoConfig(o.size.w, o.size.h) : null, ainfo = vcfg ? await pickAudioConfig() : null;
    check(signal);
    if (vcfg && ainfo) return await exportFrames(song, o, vcfg, ainfo);
    onStatus('This browser cannot encode video directly, so the video is recorded in real time…', -1);
    return await exportRealtime(song, o);
  } catch (e) { throw friendlyError(e); }
}
