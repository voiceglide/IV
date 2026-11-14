// The app's colour setting: Day (the default), Night, or Auto (follows the phone). Stored on this device only.
// The page sets `data-theme` on <html> before anything is drawn (see the small script in index.html); the CSS and the preview canvas follow it.
export const THEME_KEY = 'iv.theme';
const THEMES = ['light', 'dark', 'auto'];
const BAR = { light: '#f3ecdf', dark: '#1c1814' };

/** @returns {'light'|'dark'|'auto'} */
export function getThemePref() {
  try { const v = localStorage.getItem(THEME_KEY); if (THEMES.includes(/** @type {string} */(v))) return /** @type {any} */(v); } catch (e) { /* storage blocked: Day */ }
  return 'light';
}

/** Show the colours of `pref` now: the data-theme attribute (Auto removes it, so the system setting decides) and the browser bar colour. */
export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = pref === 'dark' ? 'dark' : 'light';
  const bars = document.querySelectorAll('meta[name="theme-color"]');
  bars.forEach((m, i) => m.setAttribute('content', pref === 'auto' ? (i === 0 ? BAR.light : BAR.dark) : BAR[pref === 'dark' ? 'dark' : 'light']));
}

/** Remember and apply a choice. */
export function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch (e) { /* not saved: it still applies until the page closes */ }
  applyTheme(pref);
}
