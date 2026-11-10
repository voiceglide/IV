// Build: bundle src/ into a static site in dist/. Everything the app needs is in dist/ (no CDN, no server);
// all paths are relative, so it runs from a sub-folder as well as from the root of a domain.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const dist = join(root, 'dist');

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
const head = '<link rel="preload" href="fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>';

const html = src('index.html')
  .replace(/%APP_NAME%/g, () => appName)
  .replace('<!--HEAD-->', () => head)
  .replace('/*STYLE*/', () => fontCss + src('style.css'))
  .replace('/*APP*/', () => js);
writeFileSync(join(dist, 'index.html'), html);
copyFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), join(dist, 'THIRD-PARTY-NOTICES.md'));
console.log(`dist/index.html · ${(html.length / 1024).toFixed(1)} KB`);
