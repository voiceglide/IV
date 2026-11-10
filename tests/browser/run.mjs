// Runs every browser test against the built app in dist/.   npm run test:browser
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, loadPlaywright, reporter } from './lib.mjs';

const pw = loadPlaywright();
if (!pw) { console.log('Playwright is not installed on this machine: browser tests skipped.'); process.exit(0); }
const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(here).filter(f => f.endsWith('.mjs') && !['run.mjs', 'lib.mjs'].includes(f) && (!only.length || only.includes(f.replace('.mjs', '')))).sort();
const server = await serve(), browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), r = reporter();
try {
  for (const f of files) { console.log(`\n— ${f}`); await (await import(join(here, f))).run(browser, server.url, r); }
} catch (e) { r.failures.push('test run crashed: ' + (e && e.stack || e)); }
finally { await browser.close(); await server.close(); }
if (r.failures.length) { console.error(`\n${r.failures.length} failure(s):\n` + r.failures.join('\n')); process.exit(1); }
console.log('\nAll browser tests passed.');
