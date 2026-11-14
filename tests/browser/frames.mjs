// Renderer frames: five timestamps in each of the three aspect ratios and both themes (30 frames) are drawn and checked two ways.
// 1. Structure: right size, not blank, header / staff / lane / piano regions hold what they should, nothing in the unused margin,
//    and drawing the same frame twice gives the same pixels.
// 2. Golden references (tests/browser/golden/frames.json): each frame is reduced to a 40-column grid of average brightness values and compared
//    with the stored grid. Anti-aliasing and sub-pixel text differences average out inside a cell and pass; a moved, missing or recoloured
//    element does not. Tolerance: mean cell difference <= 1.5 of 255, no more than 1% of cells off by more than 24.
//
// Regenerating the references after an intended change to the look:   UPDATE_GOLDEN=1 npm run test:browser -- frames
// (then look at the frames and commit the JSON). To get the frames as PNG files for a look:   GOLDEN_PNG_DIR=/some/dir npm run test:browser -- frames
import { openApp } from './lib.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'frames.json');
const GRID = 40, MEAN_MAX = 1.5, CELL_OFF = 24, CELLS_OFF_MAX = 0.01;
const update = !!process.env.UPDATE_GOLDEN, pngDir = process.env.GOLDEN_PNG_DIR;
const golden = !update && existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : { grid: GRID, frames: {} };
const fresh = { grid: GRID, frames: /** @type {Record<string,string>} */({}) };

/** How far two grids are apart: mean absolute cell difference and the share of cells that differ by more than CELL_OFF. */
function gridDiff(a, b) {
  if (a.length !== b.length) return { mean: 255, off: 1 };
  let sum = 0, off = 0; const n = a.length / 2;
  for (let k = 0; k < n; k++) { const d = Math.abs(parseInt(a.substr(k * 2, 2), 16) - parseInt(b.substr(k * 2, 2), 16)); sum += d; if (d > CELL_OFF) off++; }
  return { mean: sum / n, off: off / n };
}

const RATIOS = [['9:16', 1080, 1920], ['1:1', 1080, 1080], ['16:9', 1920, 1080]];
const STAMPS = [0, 0.18, 0.41, 0.66, 0.93]; // fractions of the loop

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 390, height: 844 }, mobile: true });
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['paper', 'night']) for (const [name, w, h] of RATIOS) {
    const res = await page.evaluate(({ w, h, theme, STAMPS, GRID, PNG }) => {
      const app = /** @type {any} */(window).__app, s = app.song(), rd = app.renderer, cv = rd.canvas, g = cv.getContext('2d');
      rd.configure({ w, h, theme }); const L = rd.layout, out = [];
      const cells = (d, w, h, gx) => { // average brightness of every cell of a gx-wide grid, two hex digits each
        const gy = Math.round(gx * h / w), sum = new Float64Array(gx * gy), cnt = new Float64Array(gx * gy);
        for (let y = 0; y < h; y++) { const cy = Math.min(gy - 1, Math.floor(y * gy / h)); for (let x = 0; x < w; x++) { const q = (y * w + x) * 4, cx = Math.min(gx - 1, Math.floor(x * gx / w));
          sum[cy * gx + cx] += 0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2]; cnt[cy * gx + cx]++; } }
        let hex = ''; for (let k = 0; k < sum.length; k++) hex += Math.round(sum[k] / cnt[k]).toString(16).padStart(2, '0'); return hex;
      };
      const hash = d => { let x = 2166136261; for (let k = 0; k < d.length; k += 13) x = Math.imul(x ^ d[k], 16777619); return x >>> 0; };
      for (const f of STAMPS) {
        rd.draw(s, s.vs + f * s.cycle); const a = g.getImageData(0, 0, w, h).data, ha = hash(a);
        rd.draw(s, s.vs + f * s.cycle); const hb = hash(g.getImageData(0, 0, w, h).data);
        const bg = [a[0], a[1], a[2]];
        // share of pixels in a box that differ clearly from the background colour
        const busy = (x0, y0, x1, y1) => { let n = 0, t = 0; for (let y = Math.max(0, Math.round(y0)); y < Math.min(h, y1); y += 2) for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, x1); x += 2) { const q = (y * w + x) * 4; t++; if (Math.abs(a[q] - bg[0]) + Math.abs(a[q + 1] - bg[1]) + Math.abs(a[q + 2] - bg[2]) > 90) n++; } return n / Math.max(1, t); };
        out.push({ f, same: ha === hb, size: [cv.width, cv.height],
          chord: busy(L.cx - L.chordSize * 0.4, L.name - L.chordSize * 0.7, L.cx + L.chordSize * 0.4, L.name),
          staff: busy(L.playX - 30, L.staffTop, L.sx1, L.staffBot), lane: busy(L.lx0, L.laneY, L.lx1, L.laneY + L.laneH),
          piano: busy(L.kx0, L.kbY, L.kx1, L.kbY + L.kbH), margin: busy(0, h * 0.97, w, h), overall: busy(0, 0, w, h), lum: (bg[0] + bg[1] + bg[2]) / 3,
          grid: cells(a, w, h, GRID), png: PNG ? cv.toDataURL('image/png') : null });
      }
      rd.configure({ w: 1080, h: 1920, theme: 'paper' }); rd.draw(s, s.vs);
      return out;
    }, { w, h, theme, STAMPS, GRID, PNG: !!pngDir });
    const tag = `${theme} ${name}`;
    r.check(res.every(x => x.size[0] === w && x.size[1] === h), `frames ${tag}: canvas is ${w}×${h}`);
    r.check(res.every(x => x.same), `frames ${tag}: the same frame is drawn the same way twice`);
    r.check(res.every(x => x.chord > 0.1), `frames ${tag}: the chord name is drawn`, res.map(x => x.chord.toFixed(2)).join(' '));
    r.check(res.every(x => x.staff > 0.01), `frames ${tag}: the staff has voice lines`, res.map(x => x.staff.toFixed(3)).join(' '));
    r.check(res.every(x => x.lane > 0.05), `frames ${tag}: the chord lane is drawn`, res.map(x => x.lane.toFixed(2)).join(' '));
    r.check(res.every(x => x.piano > 0.3), `frames ${tag}: the piano is drawn`, res.map(x => x.piano.toFixed(2)).join(' '));
    r.check(res.every(x => x.margin < 0.02), `frames ${tag}: the bottom edge is left empty`);
    r.check(res.every(x => (theme === 'night') === (x.lum < 100)), `frames ${tag}: the theme sets the background`, `${res[0].lum.toFixed(0)}`);
    r.check(new Set(res.map(x => x.staff.toFixed(4))).size > 1, `frames ${tag}: the frames differ over time`);
    // golden references
    const bad = [];
    for (const x of res) {
      const key = `${tag} ${x.f}`; fresh.frames[key] = x.grid;
      if (pngDir && x.png) { mkdirSync(pngDir, { recursive: true }); writeFileSync(join(pngDir, `${key.replace(/[ :]/g, '_')}.png`), Buffer.from(x.png.split(',')[1], 'base64')); }
      if (update) continue;
      const ref = golden.frames[key]; if (!ref) { bad.push(`${key}: no reference`); continue; }
      const d = gridDiff(x.grid, ref); if (d.mean > MEAN_MAX || d.off > CELLS_OFF_MAX) bad.push(`${key}: mean ${d.mean.toFixed(2)}, ${(d.off * 100).toFixed(1)}% cells off`);
    }
    if (!update) r.check(!bad.length, `frames ${tag}: all five frames match their golden references`, bad.join('; ') + (bad.length ? ' (intended change? UPDATE_GOLDEN=1 npm run test:browser -- frames)' : ''));
  }
  if (update) { mkdirSync(dirname(GOLDEN), { recursive: true }); writeFileSync(GOLDEN, JSON.stringify(fresh) + '\n'); console.log(`     golden references written: ${GOLDEN}`); }
  await previewTheme(page, r);
  await context.close();
}

/** The preview follows the app's light/dark setting live and keeps its 9:16 size. */
async function previewTheme(page, r) {
  const state = () => page.evaluate(() => { const rd = /** @type {any} */(window).__app.renderer, s = /** @type {any} */(window).__app.song(), g = rd.canvas.getContext('2d');
    rd.draw(s, s.vs); const p = g.getImageData(2, 2, 1, 1).data; return { theme: rd.theme, lum: (p[0] + p[1] + p[2]) / 3, size: [rd.canvas.width, rd.canvas.height] }; });
  await page.evaluate(() => { const rd = /** @type {any} */(window).__app.renderer; rd.configure({ w: 1080, h: 1920, theme: 'paper' }); window.__stopFollow = rd.followSystem(); });
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(100);
  let st = await state(); r.check(st.theme === 'paper' && st.lum > 150 && st.size.join('x') === '1080x1920', 'preview: light app theme draws the paper look at 9:16', JSON.stringify(st));
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(100);
  st = await state(); r.check(st.theme === 'night' && st.lum < 100 && st.size.join('x') === '1080x1920', 'preview: dark app theme draws the night look at 9:16, live', JSON.stringify(st));
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(100);
  st = await state(); r.check(st.theme === 'paper', 'preview: switching back to light repaints the paper look', JSON.stringify(st));
  await page.evaluate(() => { /** @type {any} */(window).__stopFollow(); });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(100);
  st = await state(); r.check(st.theme === 'paper', 'preview: after stopping, the theme no longer follows');
  await page.emulateMedia({ colorScheme: null });
}
