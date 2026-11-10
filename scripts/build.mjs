// Assemble studio/src/* into one self-contained page: dist/index.html.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = f => readFileSync(join(root, 'studio/src', f), 'utf8');

const app = src('app.js').replace('/*PLAN*/\n', () => src('plan.js'));
const html = src('index.html')
  .replace('/*STYLE*/', () => src('style.css'))
  .replace('/*THEORY*/', () => src('theory.js'))
  .replace('/*APP*/', () => app);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html · ${(html.length / 1024).toFixed(1)} KB`);
