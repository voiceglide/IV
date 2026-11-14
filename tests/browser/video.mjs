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

  // short loops: one chord at 90 bpm with hook and reveal. Frame 0 is the cover (hook, cleanly), the reveal comes later, frame N equals frame 0
  await page.evaluate(() => { const a = /** @type {any} */(window).__app; a.store.update(p => { p.chords = [{ id: 'c0', sym: 'Fmaj7', beats: null, section: '' }]; p.tempo = 90; Object.assign(p.text, { hook: 'Watch the *voices* glide', question: 'Which chord?', reveal: 'Fmaj7 - the dreamy one' }); }, 'text:test'); });
  await page.waitForFunction('!!window.__app.song()');
  const short = await page.evaluate(() => {
    const a = /** @type {any} */(window).__app, s = a.song(), seen = {};
    for (let f = 0; f < 60; f++) { const d = a.renderer.debug(s, s.vs + f / 60 * s.cycle); if (d.alpha > 0.9) seen[d.layer] = true; }
    return { cycle: s.cycle, first: a.renderer.debug(s, s.vs), seen: Object.keys(seen) };
  });
  r.check(short.first.layer === 'hook' && short.first.alpha === 1, 'video (short loop): frame 0 shows the hook at full strength', JSON.stringify(short));
  r.check(['hook', 'question', 'reveal'].every(l => short.seen.includes(l)), 'video (short loop): hook, question and reveal each get a window', short.seen.join());
  const sloop = await frameDiff(page, 0, 1);
  r.check(sloop.diff / sloop.total < 0.001, 'video (short loop): frame N equals frame 0', `${sloop.diff} px differ`);
  await page.reload(); await page.waitForFunction('window.__app && !!window.__app.song()');
  { const w = await page.waitForSelector('#welcomeSheet', { timeout: 1500 }).catch(() => null); if (w) await page.click('#welcomeSheet button:has-text("Skip")'); }

  // a real export
  await page.evaluate(() => { const w = /** @type {any} */(window); w.__long = []; new PerformanceObserver(l => { for (const e of l.getEntries()) w.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] }); });
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  await page.click('#exportSheet .xsave');
  await page.waitForSelector('#exportSheet video', { timeout: 240000 });
  const out = await page.evaluate(async () => {
    const v = /** @type {HTMLVideoElement} */(document.querySelector('#exportSheet video')); const buf = new Uint8Array(await (await fetch(v.src)).arrayBuffer());
    let bin = ''; for (let k = 0; k < buf.length; k += 8192) bin += String.fromCharCode(...buf.subarray(k, k + 8192));
    const app = /** @type {any} */(window).__app; return { b64: btoa(bin), cycle: app.song().cycle, status: document.querySelector('#exportSheet .status').textContent };
  });
  r.check(/Video ready/.test(out.status), 'video: the export finishes', out.status);
  const long = await page.evaluate(() => /** @type {any} */(window).__long);
  const over100 = long.filter(d => d > 100).length, over250 = long.filter(d => d > 250).length; // timings vary with machine load: only real freezes fail
  r.check(Math.max(0, ...long) < 1500 && over250 <= 3, 'video: the page is never blocked for long during the export', `longest task ${Math.round(Math.max(0, ...long))} ms, ${long.length} over 50 ms, ${over100} over 100 ms`);
  const dir = mkdtempSync(join(tmpdir(), 'vid-')), file = join(dir, 'out.mp4');
  writeFileSync(file, Buffer.from(out.b64, 'base64'));
  let probe = null;
  const isMp4 = !/WebM/.test(out.status); // browsers without an H.264 encoder (stock Chromium on Linux) use the real-time WebM fallback
  if (!isMp4) console.log('     (no H.264 encoder here: the real-time WebM fallback was used, MP4 duration and colour checks skipped)');
  if (isMp4) try { probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' })); } catch (e) { console.log('(ffprobe not available: duration checks skipped)'); }
  if (probe) {
    const vs = probe.streams.find(s => s.codec_type === 'video'), as = probe.streams.find(s => s.codec_type === 'audio');
    const fps = eval(vs.avg_frame_rate), vdur = +vs.nb_read_frames / fps, adur = +as.duration;
    r.check(Math.abs(vdur - out.cycle) < 0.002, 'video: video length equals the loop length', `${vdur.toFixed(4)} s vs ${out.cycle.toFixed(4)} s`);
    r.check(adur - out.cycle > -0.002 && adur - out.cycle < 0.0215, 'video: sound length is within one audio frame of the loop', `${adur.toFixed(4)} s`);
    r.check(Math.abs(adur - vdur) < 0.0215, 'video: video and sound differ by less than one audio frame', `${(adur - vdur).toFixed(4)} s`);
    console.log('     video stream:', vs.codec_name, vs.profile, vs.pix_fmt, 'range', vs.color_range, 'matrix', vs.color_space, 'transfer', vs.color_transfer, 'primaries', vs.color_primaries, '| audio:', as.codec_name);
    r.check(vs.pix_fmt === 'yuv420p' && vs.color_space === 'bt709', 'video: limited-range BT.709 colour tags (not yuvj420p)', `${vs.pix_fmt} ${vs.color_range} ${vs.color_space}`);
    r.check(vs.width === 1080 && vs.height === 1920 && Math.abs(fps - 30) < 0.6, 'video: 1080×1920 at about 30 fps', `${vs.width}×${vs.height} @ ${fps.toFixed(3)}`);
  }

  // cancel: the button works at any moment of the export, takes effect within 2 s, nothing is saved, the keyboard lands on a real control
  for (const ms of [200, 1200, 3500]) {
    await page.click('#exportSheet .xsave');
    await page.waitForSelector('#exportSheet button:has-text("Cancel"):visible');
    await page.waitForTimeout(ms);
    const t0 = Date.now();
    // the export may finish just before the click (fast machines, the real-time fallback): then there is nothing to cancel at this point
    const clicked = await page.click('#exportSheet button:has-text("Cancel")', { timeout: 1500 }).then(() => true, () => false);
    if (!clicked) { console.log(`     (the export finished before ${ms} ms on this machine: that cancel point is skipped)`); await page.waitForFunction(() => !window.__app.busy(), null, { timeout: 20000, polling: 50 }); continue; }
    await page.waitForFunction(() => !window.__app.busy(), null, { timeout: 20000, polling: 50 });
    const took = Date.now() - t0;
    r.check(took < 2000, `video: Cancel ${ms} ms into the export releases the app within 2 s`, `${took} ms`);
    const st = await page.evaluate(() => ({ status: document.querySelector('#exportSheet .status').textContent, disabled: !!document.querySelector('#exportSheet button:disabled'), active: document.activeElement.tagName + '.' + document.activeElement.className }));
    r.check(/cancelled/i.test(st.status) && !st.disabled, 'video: after Cancel the status says so and the sheet is usable again', JSON.stringify(st));
    r.check(/xsave/.test(st.active), 'video: after Cancel the keyboard focus is on the Save video button, not the page', st.active);
  }
  await page.click('#exportSheet .xsave');
  await page.waitForSelector('#exportSheet button:has-text("Cancel"):visible');
  await page.waitForTimeout(800);
  const te = Date.now();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#exportSheet'), null, { timeout: 5000 });
  await page.waitForFunction(() => !window.__app.busy(), null, { timeout: 20000, polling: 50 });
  r.check(Date.now() - te < 2000, 'video: Escape during an export closes the sheet and releases the app within 2 s', `${Date.now() - te} ms`);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'exportBtn', null, { timeout: 3000 }).catch(() => {});
  r.check(await page.evaluate(() => document.activeElement.id === 'exportBtn'), 'video: after Escape the focus is back on the Export button', await page.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id));
  // memory: where private storage exists the video is a file there; cancelled exports leave nothing behind
  const files = await page.evaluate(async () => { try { const d = await navigator.storage.getDirectory(), n = []; for await (const [k] of /** @type {any} */(d).entries()) n.push(k); return n; } catch (e) { return null; } });
  if (files && isMp4) r.check(files.filter(n => n.startsWith('iv-export-')).length === 1, 'video: the export is kept as one private file, cancelled ones leave none', files.join());
  await context.close();
  await pickers(browser, url, r);
  await lifecycle(browser, url, r);
}

/** The video of the open Export sheet, probed with ffprobe, or null where ffprobe is missing. */
async function probeShown(page) {
  const b64 = await page.evaluate(async () => {
    const v = /** @type {HTMLVideoElement} */(document.querySelector('#exportSheet video')); const buf = new Uint8Array(await (await fetch(v.src)).arrayBuffer());
    let bin = ''; for (let k = 0; k < buf.length; k += 8192) bin += String.fromCharCode(...buf.subarray(k, k + 8192)); return btoa(bin);
  });
  const file = join(mkdtempSync(join(tmpdir(), 'vid-')), 'out.mp4'); writeFileSync(file, Buffer.from(b64, 'base64'));
  try { return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], { encoding: 'utf8' })).streams.find(x => x.codec_type === 'video'); } catch (e) { return null; }
}

/** Export sheet on the smallest phone: Format and Look pickers, remembered choice, the file's buttons visible without scrolling. */
async function pickers(browser, url, r) {
  const shots = process.env.CAPTURE_DIR;
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true });
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  const labels = await page.evaluate(() => ({ fmt: [...document.querySelectorAll('#exportSheet [aria-label="Format"] b')].map(e => e.textContent), look: [...document.querySelectorAll('#exportSheet [aria-label="Look"] b')].map(e => e.textContent),
    primary: document.querySelector('#exportSheet .xsave').textContent, moreOpen: document.querySelector('#exportSheet details').open }));
  r.check(labels.fmt.join() === 'Vertical,Square,Wide' && labels.look.join() === 'Paper,Night' && labels.primary === 'Save video' && !labels.moreOpen, 'export sheet: Format and Look pickers, one Save video button, other formats under More', JSON.stringify(labels));
  r.check(await page.evaluate(() => document.querySelector('#exportSheet input[name=xfmt]:checked').value === '9:16' && document.querySelector('#exportSheet input[name=xlook]:checked').value === 'paper'), 'export sheet: Vertical and Paper are the defaults');
  await page.waitForTimeout(500); // the sheet slides up
  if (shots) await page.screenshot({ path: join(shots, 'export-sheet-375x667.png') });
  await page.check('#exportSheet input[name=xfmt][value="1:1"]', { force: true }); await page.check('#exportSheet input[name=xlook][value=night]', { force: true });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('iv.export.look') || 'null'));
  r.check(kept && kept.ratio === '1:1' && kept.theme === 'night', 'export sheet: the choice is remembered', JSON.stringify(kept));
  await page.click('#exportSheet .xsave');
  await page.waitForSelector('#exportSheet video', { timeout: 240000 });
  const vis = await page.evaluate(() => { const b = [...document.querySelectorAll('#exportSheet button')].find(x => /Download video/.test(x.textContent)), q = b.getBoundingClientRect(), pb = document.querySelector('#exportSheet .pbody');
    return { bottom: q.bottom, top: q.top, h: innerHeight, scrolled: pb.scrollTop, share: !![...document.querySelectorAll('#exportSheet button')].find(x => /Share/.test(x.textContent)) }; });
  r.check(vis.top >= 0 && vis.bottom <= vis.h, 'export sheet: Download video is visible without scrolling at 375×667', `top ${Math.round(vis.top)} bottom ${Math.round(vis.bottom)} of ${vis.h}`);
  if (shots) await page.screenshot({ path: join(shots, 'export-done-375x667.png') });
  const vs = await probeShown(page);
  if (vs) r.check(vs.width === 1080 && vs.height === 1080, 'export: Square gives a 1080×1080 video', `${vs.width}×${vs.height}`);
  // the next visit starts from the remembered choice
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#exportSheet'));
  await page.reload(); await page.waitForFunction('window.__app && !!window.__app.song()');
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  r.check(await page.evaluate(() => document.querySelector('#exportSheet input[name=xfmt]:checked').value === '1:1' && document.querySelector('#exportSheet input[name=xlook]:checked').value === 'night'), 'export sheet: the remembered Format and Look come back after a reload');
  // a storage that throws must not break the sheet
  await page.keyboard.press('Escape');
  await page.evaluate(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  r.check(await page.evaluate(() => document.querySelector('#exportSheet input[name=xfmt]:checked').value === '9:16'), 'export sheet: works with storage blocked (defaults)');
  await page.click('#exportSheet input[name=xlook][value=night]', { force: true });
  r.check(await page.locator('#exportSheet .xsave').isEnabled(), 'export sheet: choosing a Look with storage blocked does not break it');
  await context.close();
}

/** A tiny, quick project so exports finish in a few seconds. */
const quick = page => page.evaluate(() => { const a = /** @type {any} */(window).__app; a.store.update(p => { p.chords = p.chords.slice(0, 2); p.tempo = 160; }, 'test:quick'); });

/** The video on offer belongs to the open project; the file's buttons are on screen on small and sideways phones. */
async function lifecycle(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true });
  await quick(page);
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  await page.click('#exportSheet .xsave'); await page.waitForSelector('#exportSheet video', { timeout: 120000 });
  const shown = () => page.evaluate(() => ({ video: !!document.querySelector('#exportSheet video') && !document.querySelector('#exportSheet video').closest('[hidden]'), btn: !![...document.querySelectorAll('#exportSheet button')].find(b => /Download video/.test(b.textContent) && !b.closest('[hidden]')) }));
  // same project, sheet closed and reopened: the video is still its own
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#exportSheet'));
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  let st = await shown(); r.check(st.video && st.btn, 'export sheet: reopening for the same project still offers its video', JSON.stringify(st));
  // another project is opened while the sheet is open: the video goes at once
  await page.evaluate(() => { const a = /** @type {any} */(window).__app, p = JSON.parse(JSON.stringify(a.store.project)); p.id = 'other-project'; p.name = 'Other'; p.chords = p.chords.slice(0, 1); a.store.open(p); });
  st = await shown(); r.check(!st.video && !st.btn, 'export sheet: opening another project removes the old video from the open sheet', JSON.stringify(st));
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#exportSheet'));
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  st = await shown(); r.check(!st.video && !st.btn, 'export sheet: reopening after another project was opened offers no video', JSON.stringify(st));
  // export project two, then edit it: the video is dropped again
  await page.click('#exportSheet .xsave'); await page.waitForSelector('#exportSheet video', { timeout: 120000 });
  st = await shown(); r.check(st.video && st.btn, 'export sheet: project two gets its own video', JSON.stringify(st));
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#exportSheet'));
  await page.evaluate(() => { /** @type {any} */(window).__app.store.update(p => { p.tempo = 100; }, 'test:edit'); });
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  st = await shown(); r.check(!st.video && !st.btn, 'export sheet: editing the project drops its old video', JSON.stringify(st));
  await context.close();

  // no video encoder: the real-time recording is named and described by what it really is (WebM in Chrome), never an .mp4 holding VP9
  {
    const cx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await cx.addInitScript(() => { delete /** @type {any} */(window).VideoEncoder; });
    const pg = await cx.newPage(); pg.on('pageerror', e => r.failures.push('page error: ' + e.message));
    await pg.goto(url); await pg.waitForFunction('window.__app && !!window.__app.song()');
    const w = await pg.waitForSelector('#welcomeSheet', { timeout: 1500 }).catch(() => null); if (w) await pg.click('#welcomeSheet button:has-text("Skip")');
    await quick(pg);
    await pg.click('#exportBtn'); await pg.waitForSelector('#exportSheet'); await pg.click('#exportSheet .xsave');
    await pg.waitForSelector('#exportSheet video', { timeout: 120000 });
    const info = await pg.evaluate(async () => { const v = /** @type {HTMLVideoElement} */(document.querySelector('#exportSheet video')), b = await (await fetch(v.src)).blob(), head = new Uint8Array(await b.slice(0, 4).arrayBuffer());
      return { status: document.querySelector('#exportSheet .status').textContent, head: [...head], dl: [...document.querySelectorAll('#exportSheet button')].some(x => /Download video/.test(x.textContent)) }; });
    const webm = info.head[0] === 0x1a && info.head[1] === 0x45;
    r.check(webm ? /WebM/.test(info.status) && !/MP4 ·/.test(info.status) : /MP4/.test(info.status), 'export fallback: the status names the real container', info.status);
    r.check(/approximate/.test(info.status), 'export fallback: the status says the length is only approximate', info.status);
    await cx.close();
  }

  // Download video / Cancel visible without scrolling on a phone held sideways and on the smallest phone
  for (const [w, h] of [[667, 375], [320, 568], [375, 667]]) {
    const { page: pg, context: cx } = await openApp(browser, url, r, { viewport: { width: w, height: h }, mobile: true });
    await quick(pg);
    await pg.click('#exportBtn'); await pg.waitForSelector('#exportSheet'); await pg.waitForTimeout(500);
    await pg.click('#exportSheet .xsave'); await pg.waitForSelector('#exportSheet button:has-text("Cancel"):visible');
    const box = sel => pg.evaluate(s => { const b = [...document.querySelectorAll('#exportSheet button')].find(x => new RegExp(s).test(x.textContent) && !x.closest('[hidden]') && !x.hidden); if (!b) return null; const q = b.getBoundingClientRect(); return { top: q.top, bottom: q.bottom, h: innerHeight }; }, sel);
    let q = await box('^Cancel'); r.check(q && q.top >= 0 && q.bottom <= q.h, `export sheet ${w}×${h}: Cancel is visible without scrolling`, JSON.stringify(q));
    if (process.env.CAPTURE_DIR) await pg.screenshot({ path: join(process.env.CAPTURE_DIR, `export-running-${w}x${h}.png`) });
    await pg.waitForSelector('#exportSheet video', { timeout: 120000 }); await pg.waitForTimeout(300);
    q = await box('Download video'); r.check(q && q.top >= 0 && q.bottom <= q.h, `export sheet ${w}×${h}: Download video is visible without scrolling`, JSON.stringify(q));
    if (process.env.CAPTURE_DIR) await pg.screenshot({ path: join(process.env.CAPTURE_DIR, `export-done-${w}x${h}.png`) });
    await cx.close();
  }
}
