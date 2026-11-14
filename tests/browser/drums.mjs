// The drum step grid in the real app: open the Drums tab on a 375 × 667 phone, build a pattern by tapping real squares
// (no forced clicks: a square covered by something else would fail), check the stored project, the layout and playback.
import { mkdirSync } from 'node:fs';
import { openApp } from './lib.mjs';

export async function run(browser, url, r) {
  const shots = process.env.SHOTS_DIR; if (shots) mkdirSync(shots, { recursive: true });
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true });
  const drums = () => page.evaluate(() => window.__app.store.project.tracks.drums);
  const cell = (lane, step) => page.locator(`#paneDrums .dr-cell[data-lane="${lane}"][data-step="${step}"]`);
  const shot = async n => { if (shots) await page.screenshot({ path: `${shots}/${n}.png` }); };

  // tabs: five, each at least 44 px tall, all inside the screen
  await page.click('#editBtn');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabs [role=tab]')].filter(t => !t.hidden).map(t => { const b = t.getBoundingClientRect(); return { n: t.textContent, w: b.width, h: b.height, r: b.right }; }));
  r.check(tabs.length === 5 && tabs.every(t => t.h >= 44 && t.w >= 44 && t.r <= 375), 'drums: five tabs fit at 375 px, each at least 44 px tall', JSON.stringify(tabs.map(t => [t.n, Math.round(t.w), Math.round(t.h)])));
  await page.click('#editBtn');
  await page.keyboard.press('4');
  r.check(await page.isVisible('#paneDrums') && await page.getAttribute('#tabDrums', 'aria-selected') === 'true', 'drums: the key 4 (fourth tab) opens Drums');
  await page.click('#tabChords'); await page.click('#tabDrums');
  await shot('drums-empty');

  // layout: every square is on screen and the preview keeps room
  const lay = await page.evaluate(() => {
    const cv = document.getElementById('cv').getBoundingClientRect(), sc = document.querySelector('#paneDrums .dr-scroll').getBoundingClientRect();
    const first = document.querySelector('#paneDrums .dr-cell[data-lane=kick][data-step="0"]').getBoundingClientRect(), last = document.querySelector('#paneDrums .dr-cell[data-lane=tom][data-step="0"]').getBoundingClientRect();
    return { cvH: cv.height, cvBottom: cv.bottom, gridTop: sc.top, firstTop: first.top, lastBottom: last.bottom, vh: innerHeight, scrollW: document.documentElement.scrollWidth, w: innerWidth, h: first.height, wd: first.width };
  });
  r.check(lay.firstTop >= 0 && lay.lastBottom <= lay.vh && lay.h >= 44 && lay.wd >= 44, 'drums: all six rows are on screen, squares at least 44 px', JSON.stringify(lay));
  r.check(lay.cvH >= 80 && lay.scrollW <= lay.w, 'drums: the preview keeps at least 80 px and the page does not scroll sideways', `canvas ${Math.round(lay.cvH)} px`);
  const names = await page.locator('#paneDrums .dr-hear').allTextContents();
  r.check(names.join() === 'Kick,Snare,Hi-hat,Open hat,Clap,Tom', 'drums: every row is labelled', names.join());

  // start playing, then tap a pattern: playback must keep running after each tap
  await page.click('#play'); await page.waitForTimeout(400);
  r.check(await page.evaluate(() => window.__app.engine.playing), 'drums: playing');
  for (const s of [0, 8]) await cell('kick', s).click();
  for (const s of [4, 12]) await cell('snare', s).click();
  for (const s of [2, 6, 10, 14]) await cell('hat', s).click();
  await page.waitForTimeout(300);
  r.check(await page.evaluate(() => window.__app.engine.playing), 'drums: playback keeps running after taps');
  let d = await drums();
  r.check(d.pattern === 'custom' && [0, 8].every(s => d.steps.kick[s] === 2) && [4, 12].every(s => d.steps.snare[s] === 2) && [2, 6, 10, 14].every(s => d.steps.hat[s] === 2), 'drums: tapping stores the pattern as a custom grid', JSON.stringify(d.steps.kick));
  r.check(d.steps.kick.filter(Boolean).length === 2 && d.steps.hat.filter(Boolean).length === 4 && d.steps.clap.every(x => !x), 'drums: only the tapped squares are on');
  const seen = new Set();
  for (let i = 0; i < 10; i++) { seen.add(await page.evaluate(() => { const h = document.querySelector('#paneDrums .dr-playhead'); return h.hidden ? 'hidden' : h.style.transform; })); await page.waitForTimeout(110); }
  r.check(!seen.has('hidden') && seen.size > 2, 'drums: the play head column moves while playing', [...seen].join(' '));
  await shot('drums-pattern');
  await page.click('#play');

  r.check(await cell('kick', 0).getAttribute('aria-label') === 'Kick, beat 1, step 1: normal', 'drums: a square says what it is');
  await cell('hat', 14).click();
  r.check((await drums()).steps.hat[14] === 0, 'drums: tapping a hit again removes it');

  // press and hold: accent
  await page.evaluate(() => { document.querySelector('#paneDrums .dr-scroll').scrollLeft = 0; });
  const b = await cell('kick', 0).boundingBox();
  await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  r.check((await drums()).steps.kick[0] === 3 && await cell('kick', 0).getAttribute('data-level') === '3', 'drums: press and hold makes it an accent');
  await page.click('#paneDrums .dr-brush:has-text("Soft")'); await cell('clap', 4).click();
  r.check((await drums()).steps.clap[4] === 1, 'drums: new hits use the chosen strength (soft)');

  // keyboard
  await cell('tom', 0).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  r.check((await drums()).steps.tom[2] === 1, 'drums: arrow keys move, Enter switches a hit on');
  await page.keyboard.press('a');
  r.check((await drums()).steps.tom[2] === 2, 'drums: A changes its strength');
  await page.keyboard.press('Space');
  r.check((await drums()).steps.tom[2] === 0, 'drums: Space switches it off');

  // swing, preset, clear, undo
  await page.locator('#drSwing').fill('0.3');
  r.check(Math.abs((await drums()).swing - 0.3) < 1e-9, 'drums: the swing slider is stored');
  await page.selectOption('#paneDrums select', 'four');
  d = await drums();
  r.check(d.pattern === 'custom' && d.steps.kick.filter(Boolean).length === 4 && d.swing === 0.3, 'drums: a preset is copied into the grid', JSON.stringify(d.steps.kick));
  await page.click('#paneDrums button:has-text("Clear")');
  r.check(await page.evaluate(() => Object.values(window.__app.store.project.tracks.drums.steps).every(row => row.every(x => x === 0))), 'drums: Clear empties the grid');
  await page.evaluate(() => window.__app.store.undo());
  r.check((await drums()).steps.kick.filter(Boolean).length === 4, 'drums: Undo brings the pattern back');
  r.check(await page.evaluate(() => { const L = window.__app.lab, p = window.__app.store.project; return JSON.stringify(L.normalizeProject(JSON.parse(JSON.stringify(p))).tracks.drums) === JSON.stringify(p.tracks.drums); }), 'drums: the stored project reads back unchanged');
  await context.close();
}
