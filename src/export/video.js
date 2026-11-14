// Video export: a vertical 1080×1920 clip of one seamless loop, 30 fps constant.
// Preferred path: every frame is drawn and encoded one by one (H.264 + AAC in an MP4), faster or slower than
// real time, never dropping a frame. Where the browser has no such encoders, the canvas is recorded in real time.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { renderLoop } from '../audio/engine.js';
import { W, H } from '../render/draw.js';

const FPS = 30, SR = 48000;
const tick = () => new Promise(r => setTimeout(r, 0));

async function pickVideoConfig() {
  for (const codec of ['avc1.4d0029', 'avc1.4d0028', 'avc1.640028', 'avc1.42e028']) {
    const cfg = { codec, width: W, height: H, bitrate: 8_000_000, framerate: FPS, avc: { format: /** @type {'avc'} */('avc') } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { /* try the next profile */ }
  }
  return null;
}
async function pickAudioConfig() {
  if (!globalThis.AudioEncoder) return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    /** @type {any} */ const cfg = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 160000 };
    if (mux === 'aac') cfg.aac = { format: 'aac' };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux }; } catch (e) { /* try the next codec */ }
  }
  return null;
}

/** Loudest sample of the finished file's sound track, or null where this browser cannot decode it. */
async function audioPeak(ac, arrayBuf) {
  try {
    const ab = await ac.decodeAudioData(arrayBuf); let p = 0;
    for (let ch = 0; ch < ab.numberOfChannels; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < d.length; i += 7) { const v = Math.abs(d[i]); if (v > p) p = v; } }
    return p;
  } catch (e) { return null; }
}

async function exportFrames(song, renderer, engine, vcfg, ainfo, onStatus) {
  onStatus('Rendering audio…', -1);
  const ab = await renderLoop(song, SR);
  // The loop lasts exactly as long as the sound (a whole number of samples). The frame count is rounded from 30 fps, then the frame rate is
  // nudged (29.9…30.1) so that frames × frame duration == loop duration, which keeps video and sound locked on every repeat.
  const D = ab.length / SR, N = Math.max(1, Math.round(D * FPS)), fdur = D / N;
  // the muxer uses `frameRate` as the track's time unit: a fine, fixed unit keeps the fractional frame duration exact
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: 90000 },
    audio: { codec: ainfo.mux, numberOfChannels: 2, sampleRate: SR }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  /** @type {any} */ let fail = null;
  /** @type {{data:Uint8Array, type:string, ts:number, dur:number, meta:any}[]} */ const aOut = [];
  let gotDesc = false;
  const ASC = new Uint8Array([0x11, 0x90]); // AAC-LC, 48 kHz, stereo
  const ae = new AudioEncoder({ output: (ch, m) => {
    // some browsers hand over a whole ES descriptor instead of the 2-byte AAC config, which makes the track unreadable: always use our own
    if (ainfo.mux === 'aac' && !gotDesc) { m = { decoderConfig: { codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, description: ASC } }; gotDesc = true; }
    const data = new Uint8Array(ch.byteLength); ch.copyTo(data); aOut.push({ data, type: ch.type, ts: ch.timestamp, dur: ch.duration || 0, meta: m });
  }, error: e => { fail = e; } });
  ae.configure(ainfo.cfg);
  const Lc = ab.getChannelData(0), Rc = ab.getChannelData(1), step = 4800, endS = ab.length;
  let planar = true;
  for (let i = 0; i < endS; i += step) {
    const n = Math.min(step, endS - i), ts = Math.round(i / SR * 1e6); let ad = null;
    if (planar) {
      try { const data = new Float32Array(n * 2); data.set(Lc.subarray(i, i + n), 0); data.set(Rc.subarray(i, i + n), n);
        ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: ts, data }); } catch (e) { planar = false; }
    }
    if (!ad) { const data = new Float32Array(n * 2); for (let q = 0; q < n; q++) { data[2 * q] = Lc[i + q]; data[2 * q + 1] = Rc[i + q]; }
      ad = new AudioData({ format: 'f32', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: ts, data }); }
    ae.encode(ad); ad.close();
  }
  await ae.flush(); ae.close(); if (fail) throw fail; if (!aOut.length) throw new Error('no audio was encoded');
  // drop the encoder's padding: frames that start after the loop ended; the last kept frame is cut short in the file's timing
  const endUs = Math.round(D * 1e6);
  for (const a of aOut) if (a.ts < endUs) muxer.addAudioChunkRaw(a.data, /** @type {any} */(a.type), a.ts, Math.min(a.dur, endUs - a.ts), a.meta);
  const ve = new VideoEncoder({ output: (ch, m) => muxer.addVideoChunk(ch, m), error: e => { fail = e; } });
  ve.configure(vcfg);
  for (let f = 0; f < N; f++) {
    if (fail) throw fail;
    renderer.draw(song, song.vs + f * fdur);
    const vf = new VideoFrame(renderer.canvas, { timestamp: Math.round(f * fdur * 1e6), duration: Math.round(fdur * 1e6) });
    ve.encode(vf, { keyFrame: f % 60 === 0 }); vf.close();
    while (ve.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2));
    if (f % 15 === 0) { onStatus('Rendering video…', f / N); await tick(); }
  }
  await ve.flush(); ve.close(); if (fail) throw fail; muxer.finalize();
  const buf = muxer.target.buffer;
  onStatus('Checking the sound…', -1);
  const peak = await audioPeak(engine.unlock(), buf.slice(0));
  if (peak !== null && peak < 1e-4) throw new Error('the sound track came out silent');
  return { blob: new Blob([buf], { type: 'video/mp4' }), ext: 'mp4', desc: `MP4 · 1080×1920 · ${(N / D).toFixed(2)} fps · ${ainfo.mux === 'aac' ? 'AAC' : 'Opus'} sound` };
}

function exportRealtime(song, renderer, engine, onStatus) {
  return new Promise((resolve, reject) => {
    const cv = renderer.canvas;
    if (!globalThis.MediaRecorder || !cv.captureStream) { reject(new Error('This browser cannot record video. Try a recent Chrome, Edge or Safari.')); return; }
    const tap = engine.tap();
    const stream = new MediaStream([...cv.captureStream(FPS).getVideoTracks(), ...tap.stream.getAudioTracks()]);
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : {});
    /** @type {Blob[]} */ const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = () => { tap.release(); engine.stop(); reject(new Error('The recording stopped unexpectedly.')); };
    rec.onstop = () => {
      tap.release();
      const type = rec.mimeType || 'video/webm', ext = type.includes('mp4') ? 'mp4' : 'webm';
      resolve({ blob: new Blob(chunks, { type }), ext, desc: `${ext.toUpperCase()} · recorded in real time` });
    };
    rec.start(500); engine.play(song, song.vs);
    const frame = () => {
      const t = engine.time();
      if (!engine.playing || t > song.ve) { engine.stop(); if (rec.state !== 'inactive') rec.stop(); return; }
      renderer.draw(song, t); onStatus('Recording… keep this page open and in front.', (t - song.vs) / song.cycle);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/**
 * @param {{song:any, renderer:{draw:Function, canvas:HTMLCanvasElement}, engine:any, onStatus:(text:string, progress:number)=>void}} o
 *   progress is 0…1, or −1 when the length of the step is unknown
 * @returns {Promise<{blob:Blob, ext:string, desc:string}>}
 */
export async function exportVideo({ song, renderer, engine, onStatus }) {
  engine.stop();
  const vcfg = globalThis.VideoEncoder ? await pickVideoConfig() : null, ainfo = vcfg ? await pickAudioConfig() : null;
  if (vcfg && ainfo) {
    try { return await exportFrames(song, renderer, engine, vcfg, ainfo, onStatus); }
    catch (e) { onStatus('Fast export failed, recording in real time instead…', -1); }
  }
  return exportRealtime(song, renderer, engine, onStatus);
}
