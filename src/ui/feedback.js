// Optional anonymous feedback. With no FEEDBACK_URL at build time this module does nothing at all.
import { h, ICON } from './dom.js';
import { openSheet, toast } from './sheet.js';
import { FEEDBACK_URL, APP_NAME } from '../config.js';
import { buildFeedbackPayload, messageOk, MAX_MESSAGE } from '../core/feedback.js';

export { buildFeedbackPayload };

const FAIL = 'Could not send. Check your connection and try again; your text is still here.';
const KINDS = [['bug', 'Bug'], ['chord', 'Wrong chord'], ['idea', 'Idea']];

/** @param {any} app */
export function initFeedback(app) {
  if (!FEEDBACK_URL) return;
  app.menu.add({ label: 'Send feedback', icon: ICON.message, order: 40, run: () => openFeedback(app) });
}

/** @param {any} app */
function openFeedback(app) {
  let busy = false;
  const seg = h('div', { class: 'fbseg', role: 'radiogroup', 'aria-label': 'Type' }, KINDS.map(([v, t], i) =>
    h('label', null, h('input', { type: 'radio', name: 'fbkind', value: v, checked: i === 0 }), h('span', { text: t }))));
  const text = h('textarea', { name: 'message', rows: 5, maxLength: MAX_MESSAGE, required: true, autocomplete: 'off' });
  const attach = h('input', { type: 'checkbox', name: 'attach' });
  const err = h('p', { class: 'fberr', role: 'alert', hidden: true });
  const cancel = h('button', { class: 'big ghost', type: 'button', text: 'Cancel', onClick: () => sheet.close() });
  const send = h('button', { class: 'big pink', type: 'submit', text: 'Send' });
  const showErr = (/** @type {string} */ m) => { err.textContent = m; err.hidden = false; };
  const form = h('form', { class: 'stack fbform', noValidate: true, onSubmit: async (/** @type {Event} */ e) => {
    e.preventDefault(); if (busy) return;
    err.hidden = true;
    if (!messageOk(text.value)) { showErr('Please write a few words first.'); text.focus(); return; }
    if (navigator.onLine === false) { showErr(FAIL); return; }
    const kind = /** @type {HTMLInputElement} */(seg.querySelector('input:checked')).value;
    const body = JSON.stringify(buildFeedbackPayload({ kind, message: text.value, attach: attach.checked, project: app.store.project, appName: APP_NAME }));
    busy = true; send.disabled = true; send.textContent = 'Sending…';
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(FEEDBACK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', signal: ctl.signal });
      if (!res.ok) throw new Error('status ' + res.status);
      busy = false; sheet.close(); toast('Thank you. Your feedback was sent.');
    } catch (_) {
      showErr(FAIL);
    } finally {
      clearTimeout(timer); busy = false; send.disabled = false; send.textContent = 'Send';
    }
  } },
    h('div', null, h('div', { class: 'fbgh', id: 'fbTypeLbl', text: 'Type' }), seg),
    h('label', { text: 'What happened, or what would you like?' }, text),
    h('label', { class: 'fbcheck' }, attach, h('span', { text: 'Attach my current project (chords, tempo and sound settings; no personal data)' })),
    h('p', { class: 'hint', text: 'Sent anonymously: no name, no email, no device identifier.' }),
    err,
    h('div', { class: 'btns' }, cancel, send));
  seg.setAttribute('aria-labelledby', 'fbTypeLbl'); seg.removeAttribute('aria-label');
  const sheet = openSheet({ title: 'Send feedback', id: 'feedbackSheet', body: form });
  text.focus();
}
