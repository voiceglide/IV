// The drum step grid: build a pattern by tapping, check the stored project, the touch size, the keyboard and the play head.
// The Drums tab is not wired into the page yet (that is a few lines in main.js and index.html), so this test bundles
// src/ui/drums.js on its own, mounts it in a container on the built page and drives it against the real app object.
import { build } from 'esbuild';
import { join } from 'node:path';
import { ROOT, openApp } from './lib.mjs';

export async function run(browser, url, r) {
  const out = await build({ entryPoints: [join(ROOT, 'src/ui/drums.js')], bundle: true, write: false, format: 'iife', globalName: 'DrumsUi', platform: 'browser', logLevel: 'silent' });
  const code = out.outputFiles[0].text;
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 700 }, mobile: true });
  await page.addScriptTag({ content: code });
  await page.evaluate(() => {
    const box = document.createElement('div'); box.id = 'drumTest'; box.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;overflow:auto;background:var(--paper);z-index:50;padding:0 16px';
    document.body.append(box); window.__drums = window.DrumsUi.initDrums(window.__app, box);
  });
  const drums = () => page.evaluate(() => window.__app.store.project.tracks.drums);
  const cell = (lane, step) => page.locator(`#drumTest .dr-cell[data-lane="${lane}"][data-step="${step}"]`);

  r.check(await page.locator('#drumTest [role=grid]').count() === 1 && await page.locator('#drumTest .dr-cell').count() === 6 * 16, 'drums: a grid of 6 sounds × 16 steps');
  const box = await cell('kick', 0).boundingBox();
  r.check(box && box.width >= 44 && box.height >= 44, 'drums: squares are at least 44 px', JSON.stringify(box));
  r.check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'drums: the page does not scroll sideways (the grid scrolls inside itself)');
  const names = await page.locator('#drumTest .dr-hear').allTextContents();
  r.check(names.join() === 'Kick,Snare,Hi-hat,Open hat,Clap,Tom', 'drums: every row is labelled', names.join());

  // tap a pattern: kicks on beats 1 and 3, snare on 2 and 4, hats on the off-beat eighths
  for (const s of [0, 8]) await cell('kick', s).click();
  for (const s of [4, 12]) await cell('snare', s).click();
  for (const s of [2, 6, 10, 14]) await cell('hat', s).click();
  let d = await drums();
  r.check(d.pattern === 'custom' && d.steps.kick[0] === 2 && d.steps.kick[8] === 2 && d.steps.snare[4] === 2 && d.steps.snare[12] === 2 && [2, 6, 10, 14].every(s => d.steps.hat[s] === 2), 'drums: tapping stores the pattern as a custom grid', JSON.stringify(d.steps.kick));
  r.check(d.steps.kick.filter(Boolean).length === 2 && d.steps.hat.filter(Boolean).length === 4 && d.steps.clap.every(x => !x), 'drums: only the tapped squares are on');
  r.check(await cell('kick', 0).getAttribute('aria-label') === 'Kick, beat 1, step 1: normal', 'drums: a square says what it is', await cell('kick', 0).getAttribute('aria-label'));

  // tap again removes
  await cell('hat', 14).click();
  r.check((await drums()).steps.hat[14] === 0, 'drums: tapping a hit again removes it');

  // press and hold: accent; again: soft
  await cell('kick', 0).dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, bubbles: true });
  await page.waitForTimeout(650);
  await cell('kick', 0).dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, bubbles: true });
  r.check((await drums()).steps.kick[0] === 3, 'drums: press and hold makes it an accent');
  r.check((await drums()).steps.kick[0] === 3 && await cell('kick', 0).getAttribute('data-level') === '3', 'drums: an accent is drawn as one');
  // the strength of new hits
  await page.click('#drumTest .dr-brush:has-text("Soft")'); await cell('clap', 4).click();
  r.check((await drums()).steps.clap[4] === 1, 'drums: new hits use the chosen strength (soft)');

  // keyboard
  await cell('tom', 0).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  r.check((await drums()).steps.tom[2] === 1, 'drums: arrow keys move, Enter switches a hit on');
  await page.keyboard.press('a');
  r.check((await drums()).steps.tom[2] === 2, 'drums: A changes its strength (soft to normal)');
  await page.keyboard.press('Space');
  r.check((await drums()).steps.tom[2] === 0, 'drums: Space switches it off');
  r.check(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role') === 'gridcell'), 'drums: focus stays in the grid');

  // swing, preset, clear, undo
  await page.locator('#drSwing').fill('0.3');
  r.check(Math.abs((await drums()).swing - 0.3) < 1e-9, 'drums: the swing slider is stored');
  await page.selectOption('#drumTest select', 'four');
  d = await drums();
  r.check(d.pattern === 'custom' && d.steps.kick.filter(Boolean).length === 4 && d.swing === 0.3, 'drums: a preset is copied into the grid (and keeps the swing)', JSON.stringify(d.steps.kick));
  await cell('kick', 1).click();
  r.check((await drums()).steps.kick[1] === 1 || (await drums()).steps.kick[1] === 3, 'drums: a preset can be edited');
  await page.click('#drumTest button:has-text("Clear")');
  r.check(await page.evaluate(() => Object.values(window.__app.store.project.tracks.drums.steps).every(row => row.every(x => x === 0))), 'drums: Clear empties the grid');
  await page.evaluate(() => window.__app.store.undo());
  r.check((await drums()).steps.kick.filter(Boolean).length === 5, 'drums: Undo brings the pattern back');

  // the project survives a save / load round trip with the grid intact
  r.check(await page.evaluate(() => { const L = window.__app.lab, p = window.__app.store.project; return JSON.stringify(L.normalizeProject(JSON.parse(JSON.stringify(p))).tracks.drums) === JSON.stringify(p.tracks.drums); }), 'drums: the stored project reads back unchanged');

  // the play head moves with the loop and the beat grouping is visible
  await page.evaluate(() => { const p = window.__app.store.project; window.__app.store.update(q => { q.tracks.drums.pattern = 'custom'; }, 'drums:test'); void p; });
  await page.evaluate(() => window.__app.play(window.__app.song().vs));
  await page.waitForTimeout(700);
  const seen = new Set();
  for (let i = 0; i < 12; i++) { seen.add(await page.evaluate(() => { const h = document.querySelector('#drumTest .dr-playhead'); return h.hidden ? 'hidden' : h.style.transform; })); await page.waitForTimeout(120); }
  r.check(!seen.has('hidden') && seen.size > 2, 'drums: the play head column moves while playing', [...seen].join(' '));
  await page.evaluate(() => window.__app.stop());
  await page.waitForTimeout(150);
  r.check(await page.evaluate(() => document.querySelector('#drumTest .dr-playhead').hidden), 'drums: the play head hides when stopped');
  r.check(await page.locator('#drumTest .dr-cell.beat').count() === 6 * 4, 'drums: the beats are marked in every row');
  await context.close();
}
