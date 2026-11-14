// "My projects": autosave, restore on reload, create, rename, duplicate, delete, import (valid, invalid, old), export.
import { readFile } from 'node:fs/promises';
import { openApp } from './lib.mjs';

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 390, height: 844 }, mobile: true });
  const P = () => page.evaluate(() => { const p = window.__app.store.project; return { id: p.id, name: p.name, tempo: p.tempo, chords: p.chords.map(c => c.sym).join(' ') }; });
  const rows = () => page.locator('#projectsSheet .pj-item').count();
  const openSheet = async () => { await page.click('#projBtn'); await page.waitForSelector('#projectsSheet .pj-item'); };
  await page.waitForFunction(() => /saved|tab only/.test(document.getElementById('projSub').textContent));

  const first = await P();
  await openSheet();
  r.check(await rows() === 1, 'first visit: the example is saved and listed');
  await page.waitForTimeout(400); // the sheet slides up
  const fit = await page.evaluate(() => { const b = document.querySelector('#projectsSheet .panel').getBoundingClientRect(); return b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5 && document.documentElement.scrollWidth <= innerWidth; });
  r.check(fit, 'the sheet fits a 390 px screen');
  await page.keyboard.press('Escape');

  r.check(await page.locator('#welcomeSheet').count() === 0, 'the first-run guide can be skipped');
  // autosave and restore
  await page.evaluate(() => window.__app.store.update(p => { p.tempo = 123; }, 'tempo'));
  await page.waitForTimeout(900); await page.reload(); await page.waitForFunction(() => window.__app && window.__app.store.project.tempo === 123, null, { timeout: 5000 }).catch(() => {});
  r.check(await page.waitForSelector('#welcomeSheet', { timeout: 1200 }).then(() => false, () => true), 'the first-run guide is not shown a second time');
  const back = await P();
  r.check(back.tempo === 123 && back.id === first.id, 'an edit survives a reload', JSON.stringify(back));

  // new project
  await openSheet(); await page.click('#projectsSheet button:has-text("New project")');
  await page.waitForFunction(id => window.__app.store.project.id !== id, first.id);
  r.check((await P()).name === 'Untitled 1', 'New project opens an empty-named project', (await P()).name);
  await openSheet();
  r.check(await rows() === 2, 'two projects are listed');
  const small = await page.evaluate(() => Array.from(document.querySelectorAll('#projectsSheet button')).filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5).map(b => b.textContent || b.getAttribute('aria-label')));
  r.check(small.length === 0, 'every button in the sheet is at least 44 px', small.join(','));

  // rename the open one, duplicate, delete (cancel, then confirm)
  await page.click('#projectsSheet .pj-more >> nth=0'); await page.click('#projectsSheet .pj-acts:not([hidden]) button:has-text("Rename")');
  await page.fill('.sheet.dialog input', 'Evening idea'); await page.click('.sheet.dialog button[type=submit]');
  await page.waitForFunction(() => window.__app.store.project.name === 'Evening idea');
  r.check((await page.innerText('#projName')) === 'Evening idea', 'renaming the open project updates the header');
  await page.click('#projectsSheet .pj-more >> nth=0'); await page.click('#projectsSheet .pj-acts:not([hidden]) button:has-text("Duplicate")');
  await page.waitForFunction(() => document.querySelectorAll('#projectsSheet .pj-item').length === 3);
  r.check(await page.locator('#projectsSheet .pj-item:has-text("Evening idea copy")').count() === 1, 'Duplicate adds a copy');
  const del = async confirm => { const it = page.locator('#projectsSheet .pj-item:has-text("Evening idea copy")'); if (await it.locator('.pj-acts').isHidden()) await it.locator('.pj-more').click(); await it.locator('button:has-text("Delete")').click();
    await page.click(`.sheet.dialog button:has-text("${confirm ? 'Delete' : 'Cancel'}")`); await page.waitForTimeout(300); };
  await del(false); r.check(await rows() === 3, 'Cancel keeps the project');
  await del(true); r.check(await rows() === 2, 'Delete removes it after confirmation');

  // import: invalid, old version, then export and compare
  const imp = async (name, text) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#projectsSheet button:has-text("Import file")')]);
    await fc.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) }); await page.waitForTimeout(400); };
  const before = await P();
  await imp('notes.json', 'hello');
  r.check((await P()).id === before.id && await page.locator('.toast.error').count() === 1, 'an invalid file is refused with a message and changes nothing', await page.locator('.toast').innerText().catch(() => ''));
  await imp('old.json', '{"version":1,"name":"Old","prog":"C F G","bpm":100}');
  const old = await P();
  r.check(old.name === 'Old' && old.chords === 'C F G' && old.tempo === 100, 'a version-1 file is migrated and opened', JSON.stringify(old));
  await openSheet();
  r.check(await rows() === 3, 'the imported project is listed');
  const it = page.locator('#projectsSheet .pj-item:has-text("Old")'); await it.locator('.pj-more').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), it.locator('button:has-text("Export file")').click()]);
  const file = JSON.parse(await readFile(await dl.path(), 'utf8'));
  r.check(dl.suggestedFilename() === 'old.json' && file.chords.map(c => c.sym).join(' ') === 'C F G' && file.version === 3, 'Export file downloads the project in the current format');
  await context.close();
}
