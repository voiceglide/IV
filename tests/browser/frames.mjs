// Renderer frames: five timestamps in each of the three aspect ratios and both themes are drawn and checked structurally
// (right size, not blank, header / staff / lane / piano regions hold what they should, nothing in the unused margin,
// and drawing the same frame twice gives the same pixels). Exact pixel references would break on every font update.
import { openApp } from './lib.mjs';

const RATIOS = [['9:16', 1080, 1920], ['1:1', 1080, 1080], ['16:9', 1920, 1080]];
const STAMPS = [0, 0.18, 0.41, 0.66, 0.93]; // fractions of the loop

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 390, height: 844 }, mobile: true });
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['paper', 'night']) for (const [name, w, h] of RATIOS) {
    const res = await page.evaluate(({ w, h, theme, STAMPS }) => {
      const app = /** @type {any} */(window).__app, s = app.song(), rd = app.renderer, cv = rd.canvas, g = cv.getContext('2d');
      rd.configure({ w, h, theme }); const L = rd.layout, out = [];
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
          piano: busy(L.kx0, L.kbY, L.kx1, L.kbY + L.kbH), margin: busy(0, h * 0.97, w, h), overall: busy(0, 0, w, h), lum: (bg[0] + bg[1] + bg[2]) / 3 });
      }
      rd.configure({ w: 1080, h: 1920, theme: 'paper' }); rd.draw(s, s.vs);
      return out;
    }, { w, h, theme, STAMPS });
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
  }
  await context.close();
}
