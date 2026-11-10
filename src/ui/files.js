// Saving and opening files from the browser, without any server.
import { h } from './dom.js';

/** Offer a blob as a download. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: 'display:none' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Can this device share this file through its own share sheet? */
export function canShare(blob, name) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })); } catch (e) { return false; }
}
/** Resolves false when sharing failed (not when the person just closed the share sheet). */
export async function shareBlob(blob, name, title) {
  try { await navigator.share({ files: [new File([blob], name, { type: blob.type })], title }); return true; }
  catch (e) { return !!(e && /** @type {any} */(e).name === 'AbortError'); }
}

/** Let the person pick one file; resolves with its text, or null when nothing was picked. */
export function pickTextFile(accept) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0]; input.remove();
      if (!f) { resolve(null); return; }
      if (f.size > 5e6) { resolve({ name: f.name, text: '', tooBig: true }); return; }
      resolve({ name: f.name, text: await f.text(), tooBig: false });
    });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.append(input); input.click();
  });
}
