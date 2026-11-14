// Build: bundle src/ into a static site in dist/. Everything the app needs is in dist/ (no CDN, no server);
// all paths are relative, so it runs from a sub-folder as well as from the root of a domain.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const src = f => readFileSync(join(root, 'src', f), 'utf8');
// OUT_DIR lets tests build a variant (for example with FEEDBACK_URL set) without touching dist/
const dist = join(root, process.env.OUT_DIR || 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'fonts'), { recursive: true });

const bundle = await build({
  entryPoints: [join(root, 'src/ui/main.js')], bundle: true, format: 'iife', minify: true, write: false,
  target: ['es2020', 'safari14'], legalComments: 'none',
  define: { __FEEDBACK_URL__: JSON.stringify(process.env.FEEDBACK_URL || '') },
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const appName = (/APP_NAME = '([^']*)'/.exec(src('config.js')) || [])[1] || 'App';

// the typeface ships with the app (SIL Open Font License, see THIRD-PARTY-NOTICES.md)
copyFileSync(require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), join(dist, 'fonts/inter-latin.woff2'));
const fontCss = "@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(fonts/inter-latin.woff2) format('woff2')}\n";
const head = [
  '<link rel="preload" href="fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  `<meta name="apple-mobile-web-app-title" content="${appName.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`,
].join('\n');

// each feature keeps its own stylesheet in src/styles/; they are appended in name order
const stylesDir = join(root, 'src/styles');
const extraCss = existsSync(stylesDir) ? readdirSync(stylesDir).filter(f => f.endsWith('.css')).sort().map(f => '\n' + src('styles/' + f)).join('') : '';

const html = src('index.html')
  .replace(/%APP_NAME%/g, () => appName)
  .replace('<!--HEAD-->', () => head)
  .replace('/*STYLE*/', () => fontCss + src('style.css') + extraCss)
  .replace('/*APP*/', () => js);
writeFileSync(join(dist, 'index.html'), html);

// the listening page: one tap per glide sound (src/sound-check.html), its own small bundle, no outside requests
const check = await build({
  entryPoints: [join(root, 'src/soundcheck/main.js')], bundle: true, format: 'iife', minify: true, write: false,
  target: ['es2020', 'safari14'], legalComments: 'none',
});
writeFileSync(join(dist, 'sound-check.html'), src('sound-check.html').replace('/*APP*/', () => check.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
copyFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), join(dist, 'THIRD-PARTY-NOTICES.md'));

// icons and manifest (the app name is injected, never written twice)
mkdirSync(join(dist, 'icons'), { recursive: true });
for (const f of readdirSync(join(root, 'src/icons'))) copyFileSync(join(root, 'src/icons', f), join(dist, 'icons', f));
writeFileSync(join(dist, 'manifest.webmanifest'), src('manifest.webmanifest').replace(/%APP_NAME%/g, () => JSON.stringify(appName).slice(1, -1)));

// service worker: precache every file of the site; the cache version is a hash of their content, so it changes
// exactly when something the person can see changes
const walk = (d, base = '') => readdirSync(join(d, base), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d, join(base, e.name)) : [join(base, e.name)]);
const files = walk(dist).map(f => f.split('\\').join('/')).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f + '\0').update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 16);
const precache = ['./', ...files.filter(f => f !== 'index.html')];
writeFileSync(join(dist, 'sw.js'), src('sw.js')
  .replace("/*VERSION*/'dev'", () => JSON.stringify(version))
  .replace("/*PRECACHE*/['./']", () => JSON.stringify(precache)));

console.log(`${process.env.OUT_DIR || 'dist'}/index.html · ${(html.length / 1024).toFixed(1)} KB`);
