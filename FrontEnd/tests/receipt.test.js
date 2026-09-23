import test from 'node:test';
import assert from 'node:assert/strict';
import { openBookingReceipt } from '../src/utils/receipt.js';

const booking = {
  status: 'Confirmed', reservationCode: 'BIL-123', roomLabel: 'Billiards', variantLabel: 'Big Rooms',
  guestName: 'Test Guest', guestContact: '09123456789', guestEmail: 'guest@example.com',
  guestCount: 2, date: '2026-09-24', timeIn: '13:00', duration: 1,
  amount: 300, downPayment: 300, paidAmount: 300,
};

function fakeBrowser(userAgent) {
  const links = [];
  const context = {
    scale() {}, fillRect() {}, fillText() {}, drawImage() {},
    measureText(value) { return { width: String(value).length * 7 }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  const document = { activeElement: null, listeners: {} };
  function element(tagName) {
    const node = {
      tagName, children: [], listeners: {}, style: {},
      append(...children) { children.forEach((child) => { child.parent = node; node.children.push(child); }); },
      appendChild(child) { node.append(child); },
      addEventListener(type, listener) { node.listeners[type] = listener; },
      setAttribute(name, value) { node[name] = value; },
      getContext() { return context; },
      toDataURL() { return 'data:image/png;base64,AAAA'; },
      click() { if (tagName === 'a') links.push(node); node.listeners.click?.(); },
      focus() { document.activeElement = node; },
      remove() { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.removed = true; },
    };
    return node;
  }
  document.body = element('body');
  document.activeElement = element('button');
  document.createElement = element;
  document.addEventListener = (type, listener) => { document.listeners[type] = listener; };
  document.removeEventListener = (type) => { delete document.listeners[type]; };
  return { document, navigator: { userAgent }, links };
}

test('receipt downloads as an image without opening a new tab', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const browser = fakeBrowser('Mozilla/5.0 Chrome');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: browser.navigator });
  globalThis.document = browser.document;
  globalThis.window = { open() { throw new Error('A receipt must not open a new tab.'); } };
  try {
    openBookingReceipt(booking);
    assert.equal(browser.links.length, 1);
    assert.equal(browser.links[0].download, 'Riverview-Receipt-BIL-123.png');
    assert.match(browser.links[0].href, /^data:image\/png/);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test('Messenger keeps the receipt and a back action on the current page', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDocument = globalThis.document;
  const browser = fakeBrowser('Mozilla/5.0 Android MessengerForiOS');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: browser.navigator });
  globalThis.document = browser.document;
  try {
    const originalFocus = browser.document.activeElement;
    openBookingReceipt(booking);
    assert.equal(browser.links.length, 0);
    const overlay = browser.document.body.children.find((item) => item.className === 'receipt-preview-overlay');
    assert.ok(overlay);
    const [heading, instruction, image, actions] = overlay.children[0].children;
    assert.equal(heading.textContent, 'Save your receipt');
    assert.match(instruction.textContent, /press and hold/);
    assert.match(image.src, /^data:image\/png/);
    actions.children[1].click();
    assert.equal(overlay.removed, true);
    assert.equal(browser.document.activeElement, originalFocus);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    globalThis.document = originalDocument;
  }
});
