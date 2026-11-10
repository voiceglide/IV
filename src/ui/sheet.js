// Modal bottom sheets, confirmation dialogs and toasts. Every other UI module goes through these,
// so focus handling, Escape, the scrim and reduced motion behave the same everywhere.
import { h, ICON } from './dom.js';

/** @type {{root:HTMLElement, close:()=>void}[]} */
const stack = [];

function focusables(root) {
  return Array.from(root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
}

/**
 * Open a sheet. Returns a handle with close().
 * @param {{title:string, body:Node|Node[], onClose?:()=>void, canClose?:()=>boolean, kind?:'sheet'|'dialog', id?:string}} o
 *   canClose: return false to keep the sheet open (while a long job runs)
 */
export function openSheet(o) {
  const from = /** @type {HTMLElement|null} */(document.activeElement);
  const closeBtn = h('button', { class: 'icon ghost close', type: 'button', 'aria-label': 'Close', html: ICON.close });
  const title = h('h2', { text: o.title });
  const panel = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, tabIndex: -1 },
    h('div', { class: 'phead' }, title, closeBtn), h('div', { class: 'pbody' }, o.body));
  const scrim = h('div', { class: 'scrim' });
  const root = h('div', { class: 'sheet' + (o.kind === 'dialog' ? ' dialog' : ''), id: o.id }, scrim, panel);
  let open = true;
  const handle = {
    root,
    close() {
      if (!open || (o.canClose && !o.canClose())) return; open = false;
      root.remove(); stack.splice(stack.indexOf(handle), 1);
      if (!stack.length) document.body.classList.remove('lock');
      if (o.onClose) o.onClose();
      if (from && from.focus && document.contains(from)) from.focus({ preventScroll: true });
    },
    setTitle(t) { title.textContent = t; panel.setAttribute('aria-label', t); },
  };
  closeBtn.addEventListener('click', handle.close); scrim.addEventListener('click', handle.close);
  root.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = focusables(panel); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.body.append(root); document.body.classList.add('lock'); stack.push(handle);
  panel.focus({ preventScroll: true });
  return handle;
}

export function closeTopSheet() { const top = stack[stack.length - 1]; if (top) { top.close(); return true; } return false; }
export function sheetOpen() { return stack.length > 0; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && closeTopSheet()) e.stopPropagation(); });

/**
 * Ask before doing something that cannot be taken back. Resolves true only on the confirm button.
 * @param {{title:string, message:string, confirm:string, cancel?:string, danger?:boolean}} o @returns {Promise<boolean>}
 */
export function confirmDialog(o) {
  return new Promise(resolve => {
    let answer = false;
    const yes = h('button', { class: 'big' + (o.danger ? ' danger' : ''), type: 'button', text: o.confirm, onClick: () => { answer = true; s.close(); } });
    const no = h('button', { class: 'big ghost', type: 'button', text: o.cancel || 'Cancel', onClick: () => s.close() });
    const s = openSheet({ title: o.title, kind: 'dialog', body: [h('p', { class: 'msg', text: o.message }), h('div', { class: 'btns' }, no, yes)], onClose: () => resolve(answer) });
    no.focus();
  });
}

/**
 * Ask for a short text (a name). Resolves null when cancelled.
 * @param {{title:string, label:string, value?:string, confirm:string}} o @returns {Promise<string|null>}
 */
export function promptDialog(o) {
  return new Promise(resolve => {
    /** @type {string|null} */ let answer = null;
    const input = h('input', { type: 'text', value: o.value || '', maxLength: 80, autocomplete: 'off', 'aria-label': o.label });
    const done = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } answer = v; s.close(); };
    const form = h('form', { class: 'stack', onSubmit: e => { e.preventDefault(); done(); } },
      h('label', { text: o.label }, input),
      h('div', { class: 'btns' }, h('button', { class: 'big ghost', type: 'button', text: 'Cancel', onClick: () => s.close() }), h('button', { class: 'big', type: 'submit', text: o.confirm })));
    const s = openSheet({ title: o.title, kind: 'dialog', body: form, onClose: () => resolve(answer) });
    input.focus(); input.select();
  });
}

let toastTimer = 0;
/**
 * A short message at the bottom of the screen, read out by screen readers.
 * @param {string} text @param {{action?:string, onAction?:()=>void, error?:boolean, ms?:number}} [o]
 */
export function toast(text, o = {}) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  box.textContent = '';
  const el = h('div', { class: 'toast' + (o.error ? ' error' : '') }, h('span', { text }));
  if (o.action) el.append(h('button', { class: 'small ghost', type: 'button', text: o.action, onClick: () => { el.remove(); if (o.onAction) o.onAction(); } }));
  box.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), o.ms || (o.error ? 7000 : 4000));
}
