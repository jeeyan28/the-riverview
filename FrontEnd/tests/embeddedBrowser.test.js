import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmbeddedBrowserInfo, getExternalBrowserUrl } from '../src/utils/embeddedBrowser.js';

test('recognizes Messenger on Android and iOS', () => {
  assert.equal(getEmbeddedBrowserInfo('Mozilla/5.0 (Linux; Android 14) FBAN/Messenger').name, 'Messenger');
  assert.equal(getEmbeddedBrowserInfo('Mozilla/5.0 (iPhone) MessengerForiOS').name, 'Messenger');
});

test('Android handoff keeps the login path and reservation return URL', () => {
  const page = 'https://riverview.example/login?returnTo=%2Frooms%2F7';
  assert.equal(
    getExternalBrowserUrl(page, 'Mozilla/5.0 (Linux; Android 14) FBAN/Messenger'),
    'intent://riverview.example/login?returnTo=%2Frooms%2F7#Intent;scheme=https;package=com.android.chrome;end',
  );
});

test('does not create an Android intent on iOS or for unsafe page URLs', () => {
  assert.equal(getExternalBrowserUrl('https://riverview.example/login', 'Mozilla/5.0 (iPhone) MessengerForiOS'), null);
  assert.equal(getExternalBrowserUrl('javascript:alert(1)', 'Android'), null);
});
