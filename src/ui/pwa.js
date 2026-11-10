// Offline support and install: registers the service worker, offers updates and installation. Nothing here is
// ever forced: an update is applied only when the person taps Reload, and never during a long job.
import { h, ICON } from './dom.js';
import { openSheet, toast } from './sheet.js';

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */(navigator).standalone === true;

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua);
}

/** @param {any} app */
export function initPwa(app) {
  addInstall(app);
  addOfflineNotice();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) registerWorker(app);
}

/** @param {any} app */
function registerWorker(app) {
  const sw = navigator.serviceWorker;
  let reloading = false, wanted = false;
  sw.addEventListener('controllerchange', () => {
    if (!wanted || reloading || app.busy()) return;
    reloading = true; location.reload();
  });
  /** @param {ServiceWorker} worker */
  const announce = worker => toast('A new version is ready.', {
    action: 'Reload', ms: 10000,
    onAction: () => {
      if (app.busy()) { toast('Finish the current job first, then reload.'); return; }
      wanted = true; worker.postMessage({ type: 'SKIP_WAITING' });
    },
  });
  sw.register('sw.js', { scope: './' }).then(reg => {
    // only an update counts: the very first install has no controller yet and needs no message
    const watch = () => {
      if (reg.waiting && sw.controller) announce(reg.waiting);
    };
    watch();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && sw.controller) announce(w); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(e => console.warn('Service worker not registered:', e && e.message));
}

/** @param {any} app */
function addInstall(app) {
  if (standalone()) return;
  /** @type {any} */ let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    if (deferred) { deferred = e; return; }
    deferred = e;
    app.menu.add({ label: 'Install app', icon: ICON.download, order: 30, run: () => {
      const ev = deferred; if (!ev) return;
      deferred = null;
      ev.prompt();
    } });
  });
  if (isIosSafari()) app.menu.add({ label: 'Add to Home Screen', icon: ICON.plus, order: 30, run: openIosSheet });
}

function openIosSheet() {
  openSheet({ title: 'Add to Home Screen', id: 'installSheet', body: h('div', { class: 'stack' },
    h('p', { text: 'Open it like an app, even without a connection.' }),
    h('ol', { class: 'steps' },
      h('li', null, h('b', { text: 'Tap Share. ' }), 'It is the square with an arrow at the bottom of Safari.'),
      h('li', null, h('b', { text: 'Choose "Add to Home Screen". ' }), 'Scroll down the list if you do not see it.'),
      h('li', null, h('b', { text: 'Tap Add. ' }), 'The icon appears on your home screen.'))) });
}

function addOfflineNotice() {
  let told = false;
  const tell = () => { if (told) return; told = true; toast('You are offline. Everything still works.'); };
  window.addEventListener('offline', tell);
  if (!navigator.onLine) tell();
}
