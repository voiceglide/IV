// Several tabs, leaving the page, and records that cannot be read: what happens to the person's edits.
import { openApp } from './lib.mjs';

const settle = page => page.waitForFunction(() => /saved|tab only/.test(document.getElementById('projSub').textContent));
const ready = page => page.waitForFunction('window.__app && !!window.__app.song()');
const tempoOf = page => page.evaluate(() => window.__app.store.project.tempo);
const setTempo = (page, v) => page.evaluate(t => window.__app.store.update(p => { p.tempo = t; }, 'tempo'), v);
async function secondTab(context, url, r) {
  const b = await context.newPage();
  b.on('pageerror', e => r.failures.push('page error (tab B): ' + e.message));
  b.on('console', m => { if (m.type() === 'error') r.failures.push('console error (tab B): ' + m.text()); });
  await b.goto(url); await ready(b); await settle(b);
  return b;
}

const openFromList = async (page, id) => {
  await page.click('#projBtn'); await page.waitForSelector('#projectsSheet .pj-item');
  await page.evaluate(i => { document.querySelector(`#projectsSheet [data-more="${i}"]`).closest('.pj-item').querySelector('.pj-main').click(); }, id);
  await page.waitForFunction(i => window.__app.store.project.id === i, id);
};
async function twoTabs(browser, url, r) {
  // a second tab that only looks must not make the first tab's next edit a conflict
  const { page: A, context } = await openApp(browser, url, r);
  await settle(A);
  const B = await secondTab(context, url, r);
  await setTempo(A, 150);
  await A.waitForTimeout(900);
  r.check(await A.locator('#conflictSheet').count() === 0 && /· saved/.test(await A.innerText('#projSub')), 'two tabs: opening a second tab does not turn the first tab\'s edit into a conflict', await A.innerText('#projSub'));
  await B.reload(); await ready(B); await settle(B);
  r.check(await tempoOf(B) === 150, 'two tabs: the edit made in the first tab was saved', String(await tempoOf(B)));
  await setTempo(A, 151);
  await A.waitForTimeout(900);
  r.check(/· saved/.test(await A.innerText('#projSub')), 'two tabs: the first tab keeps saving after the second one opened');

  // a real conflict: both tabs edit the same project
  await B.reload(); await ready(B); await settle(B);
  await setTempo(B, 160); await B.waitForTimeout(900);
  await setTempo(A, 170);
  await A.waitForSelector('#conflictSheet', { timeout: 4000 });
  r.check(true, 'two tabs: a real conflict offers a choice instead of a dead end');
  r.check(await tempoOf(A) === 170 && /Not saved/.test(await A.innerText('#projSub')), 'two tabs: the edit stays in memory while the choice is open');
  await A.click('#conflictSheet button:has-text("Decide later")');
  await setTempo(A, 171);
  await A.waitForTimeout(700);
  r.check(await A.locator('#conflictSheet').count() === 0 && await tempoOf(A) === 171, 'two tabs: "Decide later" keeps the edits in memory and does not nag');
  const was = await A.evaluate(() => window.__app.store.project.id);
  await A.click('#projBtn'); await A.waitForSelector('#conflictSheet');
  await A.click('#conflictCopy');
  await A.waitForFunction(id => window.__app.store.project.id !== id, was);
  r.check(await tempoOf(A) === 171 && /my changes/.test(await A.evaluate(() => window.__app.store.project.name)), 'two tabs: "Keep mine as a copy" opens the copy with the edits');
  await A.waitForTimeout(700);
  r.check(/· saved/.test(await A.innerText('#projSub')), 'two tabs: the copy saves normally');
  await B.reload(); await ready(B); await settle(B);
  await openFromList(B, was);
  r.check(await tempoOf(B) === 160, 'two tabs: the other version is left as it was', `${await tempoOf(B)}`);

  // take the other version: A opens the original again, B changes it, A edits
  await openFromList(A, was);
  await setTempo(B, 162); await B.waitForTimeout(900);
  await setTempo(A, 99);
  await A.waitForSelector('#conflictSheet', { timeout: 4000 });
  await A.click('#conflictLatest');
  await A.waitForFunction(() => window.__app.store.project.tempo === 162, null, { timeout: 4000 });
  r.check(true, 'two tabs: "Use the other version" loads the latest');
  await setTempo(A, 163); await A.waitForTimeout(900);
  r.check(/· saved/.test(await A.innerText('#projSub')) && await A.locator('#conflictSheet').count() === 0, 'two tabs: saving works again after the choice');
  await context.close();
}

async function leaving(browser, url, r) {
  // an edit made just before the page goes away is not lost
  const { page, context } = await openApp(browser, url, r);
  await settle(page);
  for (const [wait, tempo] of [[0, 201], [200, 202]]) {
    await setTempo(page, tempo);
    if (wait) await page.waitForTimeout(wait);
    await page.reload(); await ready(page); await settle(page);
    r.check(await tempoOf(page) === tempo, `leaving: an edit ${wait} ms before a reload survives`, String(await tempoOf(page)));
  }
  // closing the tab
  await setTempo(page, 230);
  await page.close({ runBeforeUnload: true });
  const again = await context.newPage(); await again.goto(url); await ready(again); await settle(again);
  r.check(await tempoOf(again) === 230, 'leaving: an edit made right before the tab was closed survives', String(await tempoOf(again)));
  // the database write does not land: the copy kept in localStorage puts it back at the next start
  await again.evaluate(() => { IDBObjectStore.prototype.put = function () { return /** @type {any} */({}); }; });
  await setTempo(again, 240);
  await again.reload(); await ready(again); await settle(again);
  r.check(await tempoOf(again) === 240, 'leaving: an edit that did not reach the database is restored from the copy in localStorage', String(await tempoOf(again)));
  r.check(await again.evaluate(() => localStorage.getItem('studio.pending')) === null, 'leaving: the kept copy is removed once it is back');
  await context.close();
}

async function unreadable(browser, url, r) {
  const { page, context } = await openApp(browser, url, r);
  await settle(page);
  const real = await page.evaluate(() => window.__app.store.project.id);
  await page.evaluate(() => new Promise((res, rej) => {
    const open = indexedDB.open('studio', 1);
    open.onsuccess = () => {
      const tx = open.result.transaction(['projects', 'meta'], 'readwrite'), s = tx.objectStore('projects');
      s.put({ id: 'future', version: 99, name: 'From the future', updatedAt: Date.now() + 1e9 });
      s.put({ id: 'broken', name: 'Broken one' });
      s.put({ id: 'nodate', format: 'chord-project', version: 4, name: 'No date', chords: [{ sym: 'C' }] });
      tx.objectStore('meta').put('future', 'lastOpen');
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    };
  }));
  await page.reload(); await ready(page); await settle(page);
  r.check(await page.evaluate(() => window.__app.store.project.id) === real, 'unreadable: a record that cannot be read never wins the restore, and neither does one without a date');
  await page.click('#projBtn'); await page.waitForSelector('#projectsSheet .pj-item');
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#projectsSheet .pj-item')).map(x => ({ t: x.innerText, u: x.getAttribute('data-unreadable') })));
  const fut = rows.find(x => x.u === 'newer'), bro = rows.find(x => x.u === 'damaged');
  r.check(!!fut && /newer version/i.test(fut.t) && /reload/i.test(fut.t) && !/1970|0 chords|0 BPM/.test(fut.t), 'unreadable: a record from a newer version is shown as such, with what to do', fut && fut.t);
  r.check(!!bro && /damaged/i.test(bro.t) && !/1970|0 chords|0 BPM/.test(bro.t), 'unreadable: a damaged record is shown as damaged', bro && bro.t);
  r.check(rows.length === 4 && rows[0].u === null && /No date/.test(rows[1].t), 'unreadable: readable ones come first, the dated one before the undated one', rows.map(x => x.t.split('\n')[0]).join(' | '));
  await page.waitForTimeout(400);
  await page.locator('#projectsSheet .pj-item[data-unreadable=newer] .pj-main').click();
  r.check(await page.evaluate(() => window.__app.store.project.id) === real && await page.locator('.toast.error').count() === 1, 'unreadable: it cannot be opened, and says why');
  const it = page.locator('#projectsSheet .pj-item[data-unreadable=damaged]'); await it.locator('.pj-more').click();
  r.check(await it.locator('.pj-acts button').count() === 1, 'unreadable: only Delete is offered');
  await it.locator('button:has-text("Delete")').click(); await page.click('.sheet.dialog button:has-text("Delete")'); await page.waitForTimeout(300);
  r.check(await page.locator('#projectsSheet .pj-item[data-unreadable=damaged]').count() === 0, 'unreadable: it can be deleted');
  await context.close();
}

export async function run(browser, url, r) {
  await twoTabs(browser, url, r);
  await leaving(browser, url, r);
  await unreadable(browser, url, r);
}
