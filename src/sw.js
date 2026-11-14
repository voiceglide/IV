// Service worker: keeps the whole site in a cache so the app opens offline. Plain script, not bundled.
// build.mjs replaces the two placeholders below with the file list and a content hash of the build.
const VERSION = /*VERSION*/'dev';
const PRECACHE = /*PRECACHE*/['./'];

const sw = /** @type {any} */(self);
const SCOPE = sw.registration.scope;
// the cache name includes the scope, so another app on the same origin (a sibling project page) is never touched
const PREFIX = 'app-cache:' + new URL(SCOPE).pathname + ':';
const CACHE = PREFIX + VERSION;
const HOME = new URL('./', SCOPE).href;
const NAV_TIMEOUT = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(p => new Request(new URL(p, SCOPE).href, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await sw.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') sw.skipWaiting(); });

/** The cached page for a navigation: the very file asked for first (a query string such as ?x=1 does not matter), and the app's own page
 * only for the app's own address, never for another page of the site such as sound-check.html. */
async function cached(cache, request) {
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const path = new URL(request.url).pathname, home = new URL(HOME).pathname;
  return path === home || path === home + 'index.html' ? cache.match(HOME) : undefined;
}

async function navigate(request) {
  const cache = await caches.open(CACHE);
  const net = fetch(request);
  net.catch(() => {}); // an answer that comes in after the timeout is not an unhandled error
  let timer = 0;
  const timeout = new Promise((_, no) => { timer = setTimeout(() => no(new Error('slow')), NAV_TIMEOUT); });
  try {
    const res = await Promise.race([net, timeout]);
    if (res.ok || res.status < 500) return res;
    return (await cached(cache, request)) || res;
  } catch (err) {
    return (await cached(cache, request)) || net;
  } finally { clearTimeout(timer); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(navigate(req)); return; }
  e.respondWith(caches.open(CACHE).then(async c => (await c.match(req, { ignoreSearch: true })) || fetch(req)));
});
