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
