// First-run guide: three short steps, shown once, skippable. Help (in the menu) shows them again at any time.
import { h } from './dom.js';
import { openSheet } from './sheet.js';
import { APP_NAME } from '../config.js';

export function initWelcome(app) {
  const storage = app.storage;
  if (!storage) return;
  (async () => {
    try {
      await storage.ready();
      if (await storage.getMeta('welcomed')) return;
      await storage.setMeta('welcomed', 1);
    } catch (e) { return; }
    if (document.querySelector('.sheet')) return; // something else is already asking for attention
    const steps = h('ol', { class: 'steps' },
      h('li', null, h('b', { text: 'Listen. ' }), 'Tap Play: every coloured line is one voice moving from chord to chord.'),
      h('li', null, h('b', { text: 'Change it. ' }), 'Tap Edit to swap chords, pick sounds, add bass, drums or a melody.'),
      h('li', null, h('b', { text: 'Keep it. ' }), 'Export a video, audio or MIDI file. Your work saves itself on this device.'));
    const s = openSheet({ title: `Welcome to ${APP_NAME}`, id: 'welcomeSheet', kind: 'dialog', body: [steps,
      h('div', { class: 'btns' },
        h('button', { class: 'big ghost', type: 'button', text: 'Skip', onClick: () => s.close() }),
        h('button', { class: 'big pink', type: 'button', text: 'Play the example', onClick: () => { s.close(); app.togglePlay(); } }))] });
  })();
}
