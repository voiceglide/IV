// Tiny DOM helpers.

/** @param {string} id @returns {any} */
export const $ = id => document.getElementById(id);

/**
 * Create an element. Props: class, text, html, on<Event> handlers, DOM properties, anything else as an attribute.
 * @param {string} tag @param {Record<string, any>|null} [props] @param {...any} kids @returns {any}
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && !k.startsWith('aria') && k !== 'list' && k !== 'role') /** @type {any} */(el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

const svg = (d, extra = '') => `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
/** Icons: one stroke style everywhere. */
export const ICON = {
  play: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  stop: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="currentColor"/></svg>',
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>', 'class="chev"'),
  undo: svg('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-1" transform="translate(0 -5)"/>'),
  redo: svg('<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12h1" transform="translate(0 -5)"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  edit: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  trash: svg('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  download: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  message: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
};
