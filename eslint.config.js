import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'dist-*/', 'node_modules/', '.claude/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, __FEEDBACK_URL__: 'readonly' } },
    rules: { 'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }], eqeqeq: 'error', 'no-var': 'error', 'prefer-const': 'error' },
  },
  { files: ['src/sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  {
    files: ['scripts/**', 'tests/**', '*.js', '*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
];
