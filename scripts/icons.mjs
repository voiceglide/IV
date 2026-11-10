// Renders the logo (src/icons/favicon.svg) to the PNG icons with headless Chromium, then strips every PNG chunk
// that is not needed to draw the image (no text, no time, no EXIF): the files carry no metadata.
//   node scripts/icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/icons');
const require = createRequire(import.meta.url);
let pw = null;
for (const id of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { pw = require(id); break; } catch (e) { /* try the next place */ } }
if (!pw) { console.error('Playwright is not installed on this machine.'); process.exit(1); }

const logo = readFileSync(join(dir, 'favicon.svg'), 'utf8');
const INK = '#2b2520';
// [file, size, logo scale, background]: "any" icons keep the round logo on transparent corners,
// the maskable and Apple icons are full-bleed squares (the platform rounds them) with the logo inside the safe zone.
const JOBS = [
  ['icon-192.png', 192, 1, null],
  ['icon-512.png', 512, 1, null],
  ['icon-maskable-512.png', 512, 0.7, INK],
  ['apple-touch-icon.png', 180, 0.8, INK],
];

const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'pHYs']);
function strip(buf) {
  const out = [buf.subarray(0, 8)];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    if (KEEP.has(type)) out.push(buf.subarray(p, p + 12 + len));
    p += 12 + len;
  }
  return Buffer.concat(out);
}

const browser = await pw.chromium.launch();
try {
  for (const [file, size, scale, bg] of JOBS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const inner = Math.round(size * scale), pad = (size - inner) / 2;
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${bg || 'transparent'}"><div style="position:absolute;left:${pad}px;top:${pad}px;width:${inner}px;height:${inner}px">${logo.replace('width="132" height="132"', `width="${inner}" height="${inner}"`)}</div></body></html>`);
    const png = await page.screenshot({ type: 'png', omitBackground: !bg, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(join(dir, file), strip(png));
    await page.close();
    console.log('wrote', file);
  }
} finally { await browser.close(); }
