// PWA test: manifest and icons, the service worker takes control, and the app opens offline (reload and new tab).
import { openApp } from './lib.mjs';

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

  await context.setOffline(false);
  await context.close();
}
