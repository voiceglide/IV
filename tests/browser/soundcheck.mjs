// Smoke test of the listening page (dist/sound-check.html): a tile per glide sound, one tap plays, notes are kept, no outside requests.
import { setTimeout as sleep } from 'node:timers/promises';

export async function run(browser, url, r) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', e => r.failures.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') r.failures.push('console error: ' + m.text()); });
  page.on('request', q => { if (!q.url().startsWith(new URL(url).origin) && !/^(data|blob):/.test(q.url())) r.failures.push('third-party request: ' + q.url()); });
  await page.goto(url + 'sound-check.html');
  const tiles = await page.locator('#list .tile').count();
  r.check(tiles === 12, 'sound check: one tile per glide sound', `${tiles}`);
  r.check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'sound check: no sideways scrolling on a phone');
  await page.locator('#list .tile button').nth(1).tap();
  await sleep(1200);
  const a = await page.evaluate(() => /** @type {any} */(window).__sc);
  r.check(a && a.playing && a.current === 'strings', 'sound check: one tap plays that sound', JSON.stringify(a));
  await sleep(700);
  const b = await page.evaluate(() => /** @type {any} */(window).__sc);
  r.check(b.time > a.time, 'sound check: the play head moves', `${a.time.toFixed(2)} → ${b.time.toFixed(2)}`);
  await page.locator('#list .tile button').nth(5).tap();
  await sleep(400);
  r.check((await page.evaluate(() => /** @type {any} */(window).__sc.current)) === 'whistle', 'sound check: tapping another sound switches to it');
  await page.fill('#list .tile:nth-child(6) textarea', 'a little too thin');
  await page.click('#stop'); await sleep(400);
  r.check(!(await page.evaluate(() => /** @type {any} */(window).__sc.playing)), 'sound check: Stop stops');
  await page.click('#copy');
  const all = await page.inputValue('#all');
  r.check(/Whistle: a little too thin/.test(all), 'sound check: notes are collected for copying', all.split('\n')[5]);
  // the live engine loops by itself: a 0.5 s loop for 3 s, the play head never leaves the loop window and playback never stops
  const w = await page.evaluate(async () => {
    const lab = /** @type {any} */(window).__scLab, { vs, ve } = lab.loop('C:1 G:1', 240); let lo = 1e9, hi = -1e9, stopped = false;
    const end = performance.now() + 3000;
    while (performance.now() < end) { const t = lab.engine.time(); lo = Math.min(lo, t); hi = Math.max(hi, t); if (!lab.engine.playing) stopped = true; await new Promise(r => setTimeout(r, 20)); }
    lab.engine.stop(); return { vs, ve, lo, hi, stopped };
  });
  r.check(!w.stopped && w.lo >= w.vs - 0.2 && w.hi < w.ve, 'live engine loop: the play head wraps inside the loop, nothing restarts', `${w.lo.toFixed(2)}…${w.hi.toFixed(2)} in ${w.vs.toFixed(2)}…${w.ve.toFixed(2)}`);
  await context.close();
}
