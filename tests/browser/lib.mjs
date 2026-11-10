// Shared helpers for the browser tests: a static server for dist/ and a Playwright launcher.
// Playwright is not a dependency of the project: the tests use the one installed on the machine, and skip without it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.md': 'text/plain; charset=utf-8' };

/** Serve a folder under a sub-path (like a project page), so relative URLs are really tested. */
export async function serve(dir = join(ROOT, process.env.APP_DIST || 'dist'), base = '/app/') {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(base)) { res.writeHead(404); res.end('outside the app'); return; }
    let rel = normalize(decodeURIComponent(url.pathname.slice(base.length))) || 'index.html';
    if (rel.endsWith('/') || rel === '.') rel = 'index.html';
    if (rel.startsWith('..')) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(join(dir, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(body);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = /** @type {any} */(server.address());
  return { url: `http://127.0.0.1:${port}${base}`, close: () => new Promise(r => server.close(r)) };
}

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(id); } catch (e) { /* try the next place */ } }
  return null;
}

/** Collects failures and prints one line per check. */
export function reporter() {
  const failures = [];
  return {
    failures,
    check(ok, label, detail = '') { console.log(ok ? 'ok  ' : 'FAIL', label, detail); if (!ok) failures.push(`${label} ${detail}`.trim()); },
  };
}

/** Open the app in a fresh context; page errors, console errors and any request that leaves the test server are recorded. */
export async function openApp(browser, url, r, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, serviceWorkers: opts.serviceWorkers || 'block' });
  const page = await context.newPage();
  page.on('pageerror', e => r.failures.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') r.failures.push('console error: ' + m.text()); });
  page.on('request', q => { if (!q.url().startsWith(new URL(url).origin) && !/^(data|blob):/.test(q.url())) r.failures.push('third-party request: ' + q.url()); });
  await page.goto(url);
  await page.waitForFunction('window.__app && !!window.__app.song()');
  // the first-run guide appears once per browser profile; tests that are not about it dismiss it
  if (!opts.keepWelcome) { const w = await page.waitForSelector('#welcomeSheet', { timeout: 1500 }).catch(() => null); if (w) await page.click('#welcomeSheet button:has-text("Skip")'); }
  return { context, page };
}
