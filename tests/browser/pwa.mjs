// PWA test: manifest and icons, the service worker takes control, and the app opens offline (reload and new tab).
import { cp, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApp, serve, ROOT } from './lib.mjs';

export async function run(browser, url, r) {
  const origin = new URL(url).origin;
  const { context, page } = await openApp(browser, url, r, { serviceWorkers: 'allow' });
  const ask = u => page.evaluate(async u => { const res = await fetch(u); return { status: res.status, type: res.headers.get('content-type') || '', text: res.headers.get('content-type')?.includes('image') ? '' : await res.text() }; }, u);

  // manifest
  const href = await page.getAttribute('link[rel=manifest]', 'href');
  r.check(href === 'manifest.webmanifest', 'the manifest is linked with a relative URL', String(href));
  const mres = await ask(new URL(href, url).href);
  let m = null; try { m = JSON.parse(mres.text); } catch (e) { /* reported below */ }
  r.check(mres.status === 200 && !!m, 'the manifest loads and is valid JSON');
  if (m) {
    r.check(m.start_url === './' && m.scope === './', 'start_url and scope are relative');
    r.check(m.display === 'standalone' && m.name && m.name === m.short_name && m.name === await page.title(), 'standalone, and the name is the app name');
    const purposes = (m.icons || []).map(i => i.purpose);
    r.check(purposes.includes('any') && purposes.includes('maskable'), 'icons for both any and maskable');
    for (const i of m.icons || []) {
      const res = await ask(new URL(i.src, new URL(href, url)).href);
      r.check(res.status === 200 && res.type === 'image/png' && !/^[a-z]+:|^\//.test(i.src), `icon ${i.src} loads as image/png`, `${res.status} ${res.type}`);
    }
  }
  for (const sel of ['link[rel=icon]', 'link[rel=apple-touch-icon]']) {
    const res = await ask(new URL(await page.getAttribute(sel, 'href'), url).href);
    r.check(res.status === 200, `${sel} loads`);
  }

  // the worker becomes active and controls the page
  await page.waitForFunction(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !!(reg && reg.active && reg.active.state === 'activated'); }, null, { timeout: 15000 });
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) { await page.reload(); await page.waitForFunction('window.__app && !!window.__app.song()'); }
  await page.waitForFunction('!!navigator.serviceWorker.controller', null, { timeout: 15000 });
  r.check(true, 'the service worker is active and controls the page');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  r.check(scope === url, 'the worker scope is the app folder', scope);
  const names = await page.evaluate(() => caches.keys());
  r.check(names.length === 1 && names[0].startsWith('app-cache:'), 'one versioned cache', names.join(','));

  // offline: reload, then a brand-new page
  const fonts = [];
  page.on('response', res => { if (res.url().includes('inter-latin')) fonts.push(res); });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction('window.__app && !!window.__app.song()');
  r.check(await page.evaluate(() => !!window.__app.song()), 'offline: the app reloads and works');
  await page.waitForTimeout(500);
  const fontOk = await page.evaluate(async () => { try { await document.fonts.load('16px Inter'); const res = await fetch('fonts/inter-latin.woff2'); return res.status === 200 && (await res.arrayBuffer()).byteLength > 1000; } catch (e) { return false; } });
  r.check(fontOk, 'offline: the font is served from the cache');
  r.check(fonts.length > 0 && fonts.every(f => f.status() === 200 && f.fromServiceWorker()), 'offline: the font request is answered by the worker', fonts.map(f => f.status()).join(','));

  const page2 = await context.newPage();
  page2.on('pageerror', e => r.failures.push('page error: ' + e.message));
  page2.on('console', x => { if (x.type() === 'error') r.failures.push('console error (new tab): ' + x.text()); });
  page2.on('request', q => { if (!q.url().startsWith(origin) && !/^(data|blob):/.test(q.url())) r.failures.push('third-party request: ' + q.url()); });
  await page2.goto(url);
  await page2.waitForFunction('window.__app && !!window.__app.song()');
  r.check(true, 'offline: a new tab opens the app');
  const offlineToast = await page2.evaluate(() => (document.getElementById('toasts') || {}).textContent || '');
  r.check(/offline/i.test(offlineToast), 'the offline notice is shown', offlineToast);

  // another page of the site, offline: its own file is served, never the app (also with a query string)
  for (const q of ['sound-check.html', 'sound-check.html?x=1']) {
    const p3 = await context.newPage();
    p3.on('pageerror', e => r.failures.push('page error (sound check): ' + e.message));
    await p3.goto(url + q);
    const got = await p3.evaluate(() => ({ title: document.title, tiles: document.querySelectorAll('#list .tile').length, app: !!window.__app }));
    r.check(got.title === 'Sound check' && got.tiles > 0 && !got.app, `offline: ${q} opens the sound check, not the app`, JSON.stringify(got));
    await p3.close();
  }
  const p4 = await context.newPage();
  await p4.goto(url + '?utm=1'); await p4.waitForFunction('window.__app && !!window.__app.song()');
  r.check(true, 'offline: the app opens with a query string');
  await p4.close();

  await context.setOffline(false);
  await context.close();

  // an update that is ready stays visible in the menu, and the toast comes back when the page is shown again
  const dir = await mkdtemp(join(tmpdir(), 'iv-pwa-'));
  await cp(join(ROOT, process.env.APP_DIST || 'dist'), dir, { recursive: true });
  const srv = await serve(dir);
  const up = await openApp(browser, srv.url, r, { serviceWorkers: 'allow' });
  await up.page.waitForFunction(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !!(reg && reg.active && reg.active.state === 'activated'); }, null, { timeout: 15000 });
  if (!await up.page.evaluate(() => !!navigator.serviceWorker.controller)) { await up.page.reload(); await up.page.waitForFunction('window.__app && !!window.__app.song()'); }
  await up.page.waitForFunction('!!navigator.serviceWorker.controller', null, { timeout: 15000 });
  const sw = await readFile(join(dir, 'sw.js'), 'utf8');
  await writeFile(join(dir, 'sw.js'), sw.replace(/const VERSION = "[^"]*"/, 'const VERSION = "next-build"'));
  await up.page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await up.page.waitForSelector('.toast:has-text("new version")', { timeout: 15000 });
  r.check(true, 'an update is announced with a toast');
  await up.page.evaluate(() => { document.getElementById('toasts').textContent = ''; }); // the toast is gone (replaced, timed out)
  await up.page.click('#menuBtn');
  const label = await up.page.locator('#menuSheet button:has-text("Update ready")').count();
  r.check(label === 1, 'the update stays in the menu after the toast is gone');
  r.check(await up.page.locator('#menuBtn .upd-dot').count() === 1, 'the menu button shows that an update is ready');
  await up.page.keyboard.press('Escape');
  await up.page.click('#menuBtn'); await up.page.click('#menuSheet button:has-text("Update ready")');
  await up.page.waitForFunction(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !reg.waiting; }, null, { timeout: 15000 });
  r.check(true, 'choosing it from the menu applies the update');
  await up.context.close(); await srv.close(); await rm(dir, { recursive: true, force: true });
}
