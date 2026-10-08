import js from '@eslint/js';
import hooks from 'eslint-plugin-react-hooks';

const browserGlobals = Object.fromEntries(['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'console', 'fetch', 'Headers', 'Request', 'Response', 'URL', 'URLSearchParams', 'AbortController', 'DOMException', 'FormData', 'File', 'FileReader', 'Blob', 'Image', 'HTMLElement', 'Element', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'BroadcastChannel', 'Event', 'EventTarget', 'CustomEvent', 'TextEncoder', 'queueMicrotask', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'alert', 'confirm', 'btoa', 'atob', 'crypto', 'performance', 'matchMedia'].map(name => [name, 'readonly']));
const jsxUse = { rules: { used: { create(context) { return { JSXOpeningElement(node) {
  let name = node.name;
  while (name.type === 'JSXMemberExpression') name = name.object;
  if (name.type === 'JSXIdentifier' && /^[A-Z]/.test(name.name)) context.sourceCode.markVariableAsUsed(name.name, node);
} }; } } } };
export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  { ...js.configs.recommended, files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'] },
  { files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: browserGlobals }, plugins: { 'react-hooks': hooks, jsx: jsxUse }, rules: {
    'jsx/used': 'error', 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', varsIgnorePattern: '^React$|^_' }],
  } },
  { files: ['tests/browser/**/*.js'], languageOptions: { globals: { process: 'readonly', innerWidth: 'readonly' } } },
  { files: ['src/context/AuthContext.jsx', 'src/components/BookingModal.jsx', 'src/components/GuestAvailability.jsx', 'src/components/admin/MonitorDialogs.jsx', 'src/hooks/useBookingAvailability.js', 'src/hooks/useBookingHold.js', 'src/hooks/useCheckoutAttempt.js', 'src/hooks/usePaymentPolling.js', 'src/hooks/usePublicAvailability.js', 'src/hooks/useDialogFocus.js', 'src/hooks/useGoogleAuth.js'], rules: { 'react-hooks/exhaustive-deps': 'error' } },
];
