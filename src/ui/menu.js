// The "more" menu and the help sheet. Other modules add their own entries with app.menu.add().
import { h, ICON } from './dom.js';
import { openSheet } from './sheet.js';
import { APP_NAME } from '../config.js';

export function initMenu() {
  /** @type {{label:string, icon:string, run:()=>void, order:number}[]} */
  const items = [];
  const menu = {
    /** @param {{label:string, icon?:string, run:()=>void, order?:number}} item */
    add(item) { items.push({ icon: '', order: 50, ...item }); items.sort((a, b) => a.order - b.order); },
  };
  document.getElementById('menuBtn').addEventListener('click', () => {
    const s = openSheet({ title: APP_NAME, id: 'menuSheet', body: h('div', { class: 'stack' },
      items.map(it => h('button', { class: 'ld', type: 'button', onClick: () => { s.close(); it.run(); } }, h('span', null, h('b', { text: it.label })), h('i', { html: it.icon || ICON.right })))) });
  });

  const keys = [['Space', 'Play or stop'], ['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z', 'Redo'], ['E', 'Open or close Edit'], ['1 – 4', 'Switch Edit tab'], ['N', 'Add a chord'], ['X', 'Export'], ['P', 'My projects'], ['?', 'This help'], ['Esc', 'Close a panel']];
  function openHelp() {
    openSheet({ title: 'Help', id: 'helpSheet', body: h('div', { class: 'stack help' },
      h('ol', { class: 'steps' },
        h('li', null, h('b', { text: 'Listen. ' }), 'Tap Play. Each coloured line is one voice of the chord; watch how little each one moves to reach the next chord.'),
        h('li', null, h('b', { text: 'Make it yours. ' }), 'Tap Edit, then a chord to change it, or Add for a new one. Sound picks the instruments, Text writes on the video.'),
        h('li', null, h('b', { text: 'Keep it. ' }), 'Export saves a video, audio or MIDI file. Your work is saved on this device as you go; My projects (top left) holds all of it.')),
      h('div', { class: 'gh', text: 'Good to know' }),
      h('ul', { class: 'plain' },
        h('li', { text: 'Undo and redo are the two arrows at the top. Nothing you do here is final.' }),
        h('li', { text: 'No sound on iPhone? Turn the volume up and tap Play again; the app plays even with the silent switch on.' }),
        h('li', { text: 'Everything stays on your device. There is no account and no tracking.' }),
        h('li', { text: 'To move a project to another device, use Export → Project file, then My projects → Import there.' })),
      h('div', { class: 'gh keysh', text: 'Keyboard shortcuts' }),
      h('dl', { class: 'keys keysh' }, keys.map(([k, v]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: v })])),
      h('p', { class: 'hint', text: `${APP_NAME} · All rights reserved. Uses the Inter typeface (SIL Open Font License) and mp4-muxer (MIT License).` })) });
  }
  menu.add({ label: 'Help', icon: ICON.help, run: openHelp, order: 10 });
  return { menu, openHelp };
}
