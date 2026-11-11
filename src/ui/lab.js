// Hooks for the automated tests: the pure modules and an audio measuring bench, reachable as window.__app.lab.
import { renderLoop } from '../audio/engine.js';
import { INSTRUMENTS, CHORD_INSTRUMENTS, BASS_INSTRUMENTS } from '../audio/instruments/index.js';
import { buildSong } from '../core/song.js';
import { GLIDES } from '../audio/glides.js';
import { newProject, normalizeProject } from '../core/project.js';

export { INSTRUMENTS, CHORD_INSTRUMENTS, BASS_INSTRUMENTS, GLIDES, buildSong, newProject, normalizeProject, renderLoop };

/**
 * Render one loop of a project offline and measure it.
 * peak: loudest sample. rms: overall level. click: the largest sample-to-sample jump that is not explained by
 * the local slope of the signal (a discontinuity), relative to full scale. dc: mean value.
 */
export async function measure(project) {
  const { song, error } = buildSong(normalizeProject(project));
  if (!song) throw new Error(error || 'no song');
  const buf = await renderLoop(song, 48000);
  let peak = 0, sum = 0, dc = 0, click = 0, bad = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i]; if (!isFinite(v)) { bad++; continue; }
      const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; dc += v; n++;
      if (i >= 3) {
        // predict this sample from the three before it (quadratic); a smooth waveform is predicted well, a click is not
        const jump = Math.abs(v - (3 * d[i - 1] - 3 * d[i - 2] + d[i - 3]));
        if (jump > click) click = jump;
      }
    }
  }
  // the loop must also close without a step: last sample → first sample
  let seam = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); seam = Math.max(seam, Math.abs(d[0] - d[d.length - 1])); }
  return { peak, rms: Math.sqrt(sum / n), dc: dc / n, click, seam, bad, seconds: buf.duration };
}

/**
 * Render ONE dry note of an instrument (no channel, no reverb) and describe it, so a sound can be judged by numbers:
 * peak, attackMs (time to reach 90 % of the peak), level 0.25 s / 1 s after the start and 0.3 s after the gate ends
 * (all relative to the peak, in dB), the strength of harmonics 1–10 at 0.3 s (dB relative to the strongest),
 * how much the spectrum changes between 0.1 s and 1 s (a static tone gives 0), and the click measure.
 */
export async function noteProfile(id, midi = 57, gate = 1.5, velocity = 1) {
  const inst = INSTRUMENTS[id]; if (!inst) throw new Error('unknown instrument ' + id);
  const sr = 48000, total = gate + 3, oac = new OfflineAudioContext(1, sr * total, sr), t0 = 0.05;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const shared = inst.setup ? inst.setup(oac, oac.destination, { start: 0, end: total }) : undefined;
  inst.note(oac, oac.destination, { midi, freq, time: t0, duration: gate, velocity }, shared);
  const d = (await oac.startRendering()).getChannelData(0);
  let peak = 0, click = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (i >= 3) click = Math.max(click, Math.abs(d[i] - (3 * d[i - 1] - 3 * d[i - 2] + d[i - 3]))); }
  const rmsAt = (t, w = 0.04) => { let s = 0; const a = Math.floor((t0 + t) * sr), n = Math.floor(w * sr); for (let i = a; i < a + n && i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / n); };
  const db = x => Math.round(200 * Math.log10(Math.max(x, 1e-9))) / 10;
  let attack = 0; for (let i = Math.floor(t0 * sr); i < d.length; i++) if (Math.abs(d[i]) >= 0.9 * peak) { attack = (i / sr - t0) * 1000; break; }
  const harm = t => { const a = Math.floor((t0 + t) * sr), n = 8192, out = [];
    for (let k = 1; k <= 10; k++) { const w = 2 * Math.PI * freq * k / sr; let re = 0, im = 0;
      for (let i = 0; i < n; i++) { const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n), v = d[a + i] * win; re += v * Math.cos(w * i); im += v * Math.sin(w * i); }
      out.push(Math.hypot(re, im) / n * 4); }
    return out; };
  const h1 = harm(0.1), h2 = harm(1), m1 = Math.max(...h1) || 1e-9, m2 = Math.max(...h2) || 1e-9;
  const change = Math.sqrt(h1.reduce((s, v, k) => s + Math.pow(v / m1 - h2[k] / m2, 2), 0));
  const ref = rmsAt(0.02, 0.06) || 1e-9;
  return { peak: Math.round(peak * 1000) / 1000, attackMs: Math.round(attack * 10) / 10, dbAt250ms: db(rmsAt(0.25) / ref), dbAt1s: db(rmsAt(1) / ref),
    dbAfterRelease300ms: db(rmsAt(gate + 0.3) / ref), silentAtEnd: rmsAt(total - t0 - 0.1) < 1e-5,
    harmonicsDb: harm(0.3).map((v, _, a) => db(v / (Math.max(...a) || 1e-9))), spectrumChange: Math.round(change * 100) / 100, click: Math.round(click * 1e5) / 1e5 };
}
