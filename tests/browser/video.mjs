// Video export: the MP4 is one exact loop (video and sound the same length), frame N equals frame 0, frame 0 is a good cover.
import { openApp } from './lib.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Pixel difference between two renders of the same song at two times, as {diff, total}. */
const frameDiff = (page, a, b) => page.evaluate(([ta, tb]) => {
  const app = /** @type {any} */(window).__app, s = app.song(), cv = app.renderer.canvas, g = cv.getContext('2d');
  app.renderer.draw(s, s.vs + ta * s.cycle); const A = g.getImageData(0, 0, cv.width, cv.height).data;
  app.renderer.draw(s, s.vs + tb * s.cycle); const B = g.getImageData(0, 0, cv.width, cv.height).data;
  let diff = 0; for (let k = 0; k < A.length; k += 4) if (Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]) > 24) diff++;
  return { diff, total: A.length / 4 };
}, [a, b]);

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 390, height: 844 }, mobile: true });
  await page.evaluate(() => document.fonts.ready);

  // loop continuity and cover, with and without hook/question/reveal text
  for (const [name, text] of [['plain', { hook: '', question: '', reveal: '' }], ['with text', { hook: 'Watch the *voices* glide', question: 'Name the next chord?', reveal: 'Fmaj7 - the dreamy one' }]]) {
    await page.evaluate(t => { const a = /** @type {any} */(window).__app; a.store.update(p => { Object.assign(p.text, t); }, 'text:test'); }, text);
    await page.waitForFunction('!!window.__app.song()');
    const loop = await frameDiff(page, 0, 1);
    r.check(loop.diff / loop.total < 0.001, `video (${name}): frame N equals frame 0`, `${loop.diff} px differ`);
    const near = await frameDiff(page, 0, 1 - 1 / 700);
    r.check(near.diff / near.total < 0.08, `video (${name}): the last frame is close to the first (no hard pop at the loop)`, `${near.diff} px differ`);
    const cover = await page.evaluate(() => {
      const a = /** @type {any} */(window).__app, s = a.song(); a.renderer.draw(s, s.vs);
      const first = s.chords[s.n].label; return { first, shown: a.renderer.debug ? a.renderer.debug(s, s.vs) : null };
    });
    if (cover.shown) r.check(cover.shown.chord === cover.first, 'video: frame 0 shows the first chord', JSON.stringify(cover.shown));
  }

  // a real export
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  await page.click('#exportSheet button:has-text("Video")');
  await page.waitForSelector('#exportSheet video', { timeout: 240000 });
  const out = await page.evaluate(async () => {
    const v = /** @type {HTMLVideoElement} */(document.querySelector('#exportSheet video')); const buf = new Uint8Array(await (await fetch(v.src)).arrayBuffer());
    let bin = ''; for (let k = 0; k < buf.length; k += 8192) bin += String.fromCharCode(...buf.subarray(k, k + 8192));
    const app = /** @type {any} */(window).__app; return { b64: btoa(bin), cycle: app.song().cycle, status: document.querySelector('#exportSheet .status').textContent };
  });
  r.check(/Video ready/.test(out.status), 'video: the export finishes', out.status);
  const dir = mkdtempSync(join(tmpdir(), 'vid-')), file = join(dir, 'out.mp4');
  writeFileSync(file, Buffer.from(out.b64, 'base64'));
  let probe = null;
  try { probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' })); } catch (e) { console.log('(ffprobe not available: duration checks skipped)'); }
  if (probe) {
    const vs = probe.streams.find(s => s.codec_type === 'video'), as = probe.streams.find(s => s.codec_type === 'audio');
    const fps = eval(vs.avg_frame_rate), vdur = +vs.nb_read_frames / fps, adur = +as.duration;
    r.check(Math.abs(vdur - out.cycle) < 0.002, 'video: video length equals the loop length', `${vdur.toFixed(4)} s vs ${out.cycle.toFixed(4)} s`);
    r.check(adur - out.cycle > -0.002 && adur - out.cycle < 0.0215, 'video: sound length is within one audio frame of the loop', `${adur.toFixed(4)} s`);
    r.check(Math.abs(adur - vdur) < 0.0215, 'video: video and sound differ by less than one audio frame', `${(adur - vdur).toFixed(4)} s`);
    r.check(vs.width === 1080 && vs.height === 1920 && Math.abs(fps - 30) < 0.6, 'video: 1080×1920 at about 30 fps', `${vs.width}×${vs.height} @ ${fps.toFixed(3)}`);
  }
  await context.close();
}
