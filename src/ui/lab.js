// Hooks for the automated tests: the pure modules and an audio measuring bench, reachable as window.__app.lab.
import { renderLoop } from '../audio/engine.js';
import { INSTRUMENTS, CHORD_INSTRUMENTS, BASS_INSTRUMENTS } from '../audio/instruments/index.js';
import { buildSong } from '../core/song.js';
import { newProject, normalizeProject } from '../core/project.js';

export { INSTRUMENTS, CHORD_INSTRUMENTS, BASS_INSTRUMENTS, buildSong, newProject, normalizeProject, renderLoop };

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
