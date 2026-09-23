export function getEmbeddedBrowserInfo(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const ua = String(userAgent || '');
  if (/Instagram/i.test(ua)) {
    return { name: 'Instagram', instruction: 'Tap the menu, then choose Open in external browser.' };
  }
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS|MessengerForiOS|\bMessenger\b/i.test(ua)) {
    return { name: 'Messenger', instruction: 'Tap the menu (⋯), then choose Open in browser.' };
  }
  return null;
}

export function getExternalBrowserUrl(pageUrl, userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  if (!/Android/i.test(userAgent)) return null;

  const url = new URL(pageUrl);
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  // A user-initiated Android intent opens the current page in Chrome outside the WebView.
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.slice(0, -1)};package=com.android.chrome;end`;
}
