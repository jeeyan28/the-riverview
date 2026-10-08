const js = require('@eslint/js');

const nodeGlobals = Object.fromEntries(['require', 'module', '__dirname', '__filename', 'process', 'console', 'Buffer', 'fetch', 'Headers', 'Response', 'DOMException', 'URL', 'URLSearchParams', 'AbortController', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'global', 'structuredClone'].map(name => [name, 'readonly']));
module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', '.cache/**'] },
  js.configs.recommended,
  { languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: nodeGlobals }, rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  } },
  { files: ['docs/api/viewer.js'], languageOptions: { globals: { document: 'readonly' } } },
];
