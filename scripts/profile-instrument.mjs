// Describe an instrument's sound in numbers (see noteProfile in src/ui/lab.js).
//   node scripts/profile-instrument.mjs rhodes [midi …]      uses the build in dist/ (or APP_DIST)
import { serve, loadPlaywright, reporter, openApp } from '../tests/browser/lib.mjs';

const [id, ...notes] = process.argv.slice(2);
const pw = loadPlaywright();
if (!id || !pw) { console.error(pw ? 'usage: node scripts/profile-instrument.mjs <instrument-id> [midi …]' : 'Playwright is not installed here.'); process.exit(1); }
const s = await serve(), b = await pw.chromium.launch(), r = reporter();
try {
  const { page } = await openApp(b, s.url, r);
  for (const midi of (notes.length ? notes.map(Number) : [40, 57, 72, 84])) {
    const p = await page.evaluate(([i, m]) => window.__app.lab.noteProfile(i, m), [id, midi]);
    console.log(`midi ${midi}:`, JSON.stringify(p));
  }
} finally { await b.close(); await s.close(); }
if (r.failures.length) { console.error(r.failures.join('\n')); process.exit(1); }
