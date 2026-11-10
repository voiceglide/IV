// First launch as a newcomer: the guide shows, one tap plays the example; Help brings the steps back.
import { openApp } from './lib.mjs';

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true, keepWelcome: true });
  await page.waitForSelector('#welcomeSheet');
  r.check(await page.locator('#welcomeSheet .steps li').count() === 3, 'first launch: a three-step guide is shown');
  const fits = await page.evaluate(() => { const b = document.querySelector('#welcomeSheet .panel').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && b.top >= 0; });
  r.check(fits, 'the guide fits a 375 × 667 screen');
  await page.click('#welcomeSheet button:has-text("Play the example")'); await page.waitForTimeout(600);
  r.check(await page.evaluate(() => window.__app.engine.playing), 'one tap plays the example');
  await page.click('#play');
  await page.click('#menuBtn'); await page.click('#menuSheet button:has-text("Help")');
  r.check(await page.locator('#helpSheet .steps li').count() === 3, 'Help is always available from the menu');
  await page.keyboard.press('Escape');
  // keyboard: space plays, E opens Edit, undo and redo shortcuts
  await page.keyboard.press('e'); r.check(await page.isVisible('#edit'), 'E opens Edit');
  await page.evaluate(() => window.__app.store.update(p => { p.tempo = 111; }, 'tempo'));
  await page.keyboard.press('Control+z'); r.check(await page.evaluate(() => window.__app.store.project.tempo) !== 111, 'Ctrl+Z undoes');
  await page.keyboard.press('Control+Shift+z'); r.check(await page.evaluate(() => window.__app.store.project.tempo) === 111, 'Ctrl+Shift+Z redoes');
  // rotation: landscape keeps everything on screen
  await page.setViewportSize({ width: 667, height: 375 }); await page.waitForTimeout(300);
  const land = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth <= innerWidth, play: document.getElementById('play').getBoundingClientRect(), ex: document.getElementById('exportBtn').getBoundingClientRect(), cv: document.getElementById('cv').getBoundingClientRect(), w: innerWidth, hh: innerHeight }));
  r.check(land.sw && land.play.bottom <= land.hh && land.ex.bottom <= land.hh + 0.5 && land.ex.right <= land.w + 0.5 && land.cv.width > 60 && land.cv.bottom <= land.hh, 'landscape: preview and main buttons stay on screen', JSON.stringify(land));
  // background: hiding the page stops the sound
  await page.setViewportSize({ width: 375, height: 667 });
  await page.keyboard.press('e'); await page.click('#play'); await page.waitForTimeout(300);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  r.check(await page.evaluate(() => !window.__app.engine.playing), 'going to the background stops playback');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.click('#play'); await page.waitForTimeout(300);
  r.check(await page.evaluate(() => window.__app.engine.playing), 'coming back, Play works again'); await page.click('#play');
  await context.close();
}
