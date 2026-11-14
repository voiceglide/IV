// The colour setting: Day by default, Night, or Auto (like the phone). Chosen in the ⋯ menu, remembered, and followed by the preview.
import { openApp } from './lib.mjs';

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true });
  const A = fn => page.evaluate(fn);
  const info = () => A(() => { const a = /** @type {any} */(window).__app; return { attr: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, canvas: a.renderer.theme, bar: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.getAttribute('content')), saved: localStorage.getItem('iv.theme') }; });
  const choose = async label => { await page.click('#menuBtn'); await page.click('#menuSheet button:has-text("Appearance")'); await page.click(`#themeSheet label:has-text("${label}")`); await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

  // a phone set to dark still opens the app in Day: that is the default
  await page.emulateMedia({ colorScheme: 'dark' }); await page.reload(); await page.waitForFunction('window.__app && !!window.__app.song()');
  let i = await info();
  r.check(i.attr === 'light' && i.bg === 'rgb(243, 236, 223)' && i.canvas === 'paper', 'theme: Day is the default even when the phone is set to dark', JSON.stringify(i));

  await choose('Night'); i = await info();
  r.check(i.attr === 'dark' && i.bg === 'rgb(28, 24, 20)' && i.canvas === 'night' && i.saved === 'dark' && i.bar.every(c => c === '#1c1814'), 'theme: Night changes the app, the preview and the browser bar', JSON.stringify(i));
  await page.emulateMedia({ colorScheme: 'light' }); await page.reload(); await page.waitForFunction('window.__app && !!window.__app.song()');
  i = await info(); r.check(i.attr === 'dark' && i.bg === 'rgb(28, 24, 20)', 'theme: Night is remembered after a reload, whatever the phone says', JSON.stringify(i));

  await choose('Day'); i = await info();
  r.check(i.attr === 'light' && i.bg === 'rgb(243, 236, 223)' && i.canvas === 'paper' && i.saved === 'light', 'theme: Day brings the light colours back', JSON.stringify(i));

  await choose('Like my phone'); await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(200); i = await info();
  r.check(i.attr === null && i.bg === 'rgb(28, 24, 20)' && i.canvas === 'night' && i.saved === 'auto', 'theme: Like my phone follows a dark phone', JSON.stringify(i));
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(200); i = await info();
  r.check(i.bg === 'rgb(243, 236, 223)' && i.canvas === 'paper', 'theme: Like my phone follows a light phone, live', JSON.stringify(i));

  await page.click('#menuBtn'); await page.click('#menuSheet button:has-text("Appearance")');
  r.check(await A(() => /** @type {HTMLInputElement} */(document.querySelector('#themeSheet input:checked')).value) === 'auto' && await A(() => [...document.querySelectorAll('#themeSheet label')].every(l => l.getBoundingClientRect().height >= 44)), 'theme: the sheet shows the current choice with 44 px targets');
  await context.close();
}
