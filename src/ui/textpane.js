// The Text tab: what is written on the video.
import { h } from './dom.js';

const FIELDS = [
  ['hook', 'Opening line (first 2.5 seconds)', 'Watch the top voice.'],
  ['question', 'Closing line (last 2 seconds)', 'Which chord surprised you?'],
  ['reveal', 'Title shown at the very end (optional)', 'My progression'],
  ['watermark', 'Small signature under the keyboard (optional)', ''],
];

export function initTextPane(app) {
  const { store } = app, pane = document.getElementById('paneText');
  /** @type {Record<string, HTMLInputElement>} */ const inputs = {};
  for (const [key, label, ph] of FIELDS) {
    const input = h('input', { type: 'text', id: 'text_' + key, placeholder: ph, maxLength: key === 'watermark' ? 60 : 120, autocomplete: 'off',
      onInput: e => store.update(p => { p.text[key] = e.target.value; }, 'text:' + key) });
    inputs[key] = input;
    pane.append(h('div', null, h('label', { for: 'text_' + key, text: label }), input));
  }
  pane.append(h('p', { class: 'hint', html: 'Put <code>*stars*</code> around a word of the opening line to colour it. Leave a field empty to hide it.' }));
  const render = () => { for (const [key] of FIELDS) if (document.activeElement !== inputs[key]) inputs[key].value = store.project.text[key]; };
  store.subscribe(render); render();
}
