import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOM = 'de0000000000000000000015';
test.beforeEach(async ({ request }) => {
  await expect.poll(async () => {
    try {
      const health = await request.get(`http://127.0.0.1:${process.env.DEMO_API_PORT || '3000'}/`);
      const status = await health.json();
      return health.ok() && status.demo === true && status.db === 'connected';
    } catch { return false; }
  }, { timeout: 20000 }).toBe(true);
  const facility = await request.get('/api/rooms/' + ROOM);
  expect(facility.ok()).toBe(true);
  expect((await facility.json())._id).toBe(ROOM);
});
async function login(page, role = 'customer') {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(`${role}@riverview.demo`);
  await page.getByLabel('Password', { exact: true }).fill('Evaluate2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
async function capture(page, name, testInfo) {
  if (process.env.CAPTURE_DOCS !== 'true' || name === 'forecast' && testInfo.project.name !== 'desktop') return;
  const dir = path.resolve('../docs/screenshots');
  await mkdir(dir, { recursive: true });
  const options = { path: path.join(dir, `${name}-${testInfo.project.name}.png`) };
  if (name === 'availability') await page.getByRole('region', { name: 'Check availability' }).screenshot({ ...options, style: '#site-header, .announcement-banner, .session-notice, .customer-app-nav { visibility: hidden !important; }' });
  else await page.screenshot({ ...options, fullPage: false });
}
async function fits(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }

test('guest sees public slots and prices, load failure has a retry', async ({ page }, testInfo) => {
  await page.goto(`/rooms/${ROOM}`);
  const panel = page.getByRole('region', { name: 'Check availability' });
  await expect(panel.getByRole('button', { name: /, Available/ }).first()).toBeVisible();
  const response = await page.request.get(`/api/bookings/slots?roomId=${ROOM}&variantLabel=Standard%20KTV&date=2099-01-02&duration=2&guestCount=3`);
  expect(response.status()).toBe(200);
  expect(JSON.stringify(await response.json())).not.toMatch(/guestName|guestEmail|bookedBy|paymentId|reservationCode/);
  await panel.getByLabel('Date', { exact: true }).fill('2099-01-03');
  await panel.getByLabel('Duration', { exact: true }).selectOption('2');
  await panel.getByRole('button', { name: '1:00 PM, Available', exact: true }).click();
  await panel.getByRole('heading', { name: 'Check availability' }).scrollIntoViewIfNeeded(); await fits(page); await capture(page, 'availability', testInfo);
  await page.route('**/api/bookings/slots?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary availability outage.' }) }));
  await panel.getByRole('button', { name: 'Refresh availability' }).click();
  await expect(panel.getByText(/Unable to load availability/)).toBeVisible();
  await page.unroute('**/api/bookings/slots?**'); await panel.getByRole('button', { name: 'Retry availability' }).click();
  await expect(panel.getByRole('button', { name: /, Available/ }).first()).toBeVisible();
});

test('PayMongo returns without flashing the website and same-tab results use server status', async ({ page, context }) => {
  await login(page);
  let opened = page.waitForEvent('popup');
  await page.evaluate(() => { window.open('/?paymongo=success&paymentIntentId=pi_popup_return', 'paymongo_pay', 'width=480,height=760'); });
  const popup = await opened;
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator('#site-header')).toBeVisible();

  await context.addInitScript(() => { window.close = () => {}; });
  opened = page.waitForEvent('popup');
  await page.evaluate(() => { window.open('/?paymongo=success&paymentIntentId=pi_close_blocked', 'paymongo_pay', 'width=480,height=760'); });
  const heldPopup = await opened;
  await expect(heldPopup.getByRole('heading', { name: 'Returning to your reservation' })).toBeVisible();
  await expect(heldPopup.locator('.public-site, .page-skeleton')).toHaveCount(0);
  await expect(heldPopup.getByRole('button', { name: 'Return to reservation' })).toBeVisible();
  await fits(heldPopup);
  await heldPopup.close();

  await page.route('**/api/payments/paymongo/status/pi_same_tab', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'cancelled' }) }));
  await page.goto('/?paymongo=success&paymentIntentId=pi_same_tab');
  await expect(page.getByRole('dialog')).toContainText('Payment cancelled');
  await expect(page.getByRole('heading', { name: 'Reservation confirmed' })).toHaveCount(0);
});

test('login restores a draft, acquires a hold and completes a synthetic payment', async ({ page }, testInfo) => {
  await page.goto(`/rooms/${ROOM}`);
  const panel = page.getByRole('region', { name: 'Check availability' });
  await panel.getByLabel('Date', { exact: true }).fill('2099-01-02');
  await panel.getByLabel('Duration', { exact: true }).selectOption('2');
  await panel.getByLabel('Guests', { exact: true }).fill('3');
  await panel.getByRole('button', { name: testInfo.project.name === 'mobile' ? '4:00 PM, Available' : '1:00 PM, Available', exact: true }).click();
  await panel.getByRole('button', { name: 'Sign in to reserve', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('customer@riverview.demo');
  await page.getByLabel('Password', { exact: true }).fill('Evaluate2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'KTV Rooms' });
  await expect(dialog.getByLabel('Last Name', { exact: true })).toBeVisible();
  await expect(dialog.locator('#bkGuestCount')).toHaveValue('3');
  await expect(dialog).toContainText('2 hours');
  await expect(dialog).toContainText('No payment or reservation yet.');
  await capture(page, 'reservation', testInfo);
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(dialog.getByRole('button', { name: 'Simulate successful payment' })).toBeVisible();
  const original = await page.evaluate(() => JSON.parse(sessionStorage.getItem('riverview_checkout_attempt')).attemptId);
  await page.reload();
  await expect(dialog.getByRole('button', { name: 'Simulate successful payment' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('riverview_checkout_attempt')).attemptId)).toBe(original);
  await dialog.getByRole('button', { name: 'Simulate successful payment' }).click();
  await expect(page.getByRole('dialog')).toContainText('Download Receipt');
  await expect(page.getByRole('dialog')).toContainText(/receipt email is being prepared|receipt email was sent|Receipt delivery is simulated/);
  await fits(page);
});

test('back and cancellation reopen an unpaid slot before checkout', async ({ page }, testInfo) => {
  await login(page);
  const court = 'de0000000000000000000016', date = testInfo.project.name === 'mobile' ? '2099-01-05' : '2099-01-04';
  await page.goto('/rooms/' + court);
  const panel = page.getByRole('region', { name: 'Check availability' });
  await panel.getByLabel('Date', { exact: true }).fill(date);
  await panel.getByRole('button', { name: '1:00 PM, Available', exact: true }).click();
  const state = async () => {
    const response = await page.request.get('/api/bookings/slots?roomId=' + court + '&variantLabel=Court&date=' + date + '&duration=1&guestCount=1');
    expect(response.status()).toBe(200);
    return (await response.json()).slots.find(slot => slot.timeIn === '13:00').state;
  };
  expect(await state()).toBe('available');
  await panel.getByRole('button', { name: 'Continue to reserve', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Basketball Court' });
  await expect(dialog.getByLabel('Last Name', { exact: true })).toBeVisible();
  expect(await state()).toBe('full');
  expect(await page.evaluate(() => sessionStorage.getItem('riverview_checkout_attempt'))).toBeNull();
  await dialog.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /^Continue(?:\s|$)/ })).toBeVisible();
  await expect.poll(state).toBe('available');
  await dialog.getByRole('button', { name: /^Continue(?:\s|$)/ }).click();
  await expect(dialog.getByLabel('Last Name', { exact: true })).toBeVisible();
  expect(await state()).toBe('full');
  await dialog.getByRole('button', { name: 'Close reservation', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(state).toBe('available');
  expect(await page.evaluate(() => sessionStorage.getItem('riverview_checkout_attempt'))).toBeNull();
  await page.goto('/rooms/' + court);
  await panel.getByLabel('Date', { exact: true }).fill(date);
  await panel.getByRole('button', { name: '1:00 PM, Available', exact: true }).click();
  await panel.getByRole('button', { name: 'Continue to reserve', exact: true }).click();
  await expect(dialog.getByLabel('Last Name', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(dialog.getByRole('button', { name: 'Simulate successful payment' })).toBeVisible();
  await page.reload();
  await expect(dialog.getByRole('button', { name: 'Simulate successful payment' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close reservation', exact: true }).click();
  await expect.poll(state).toBe('available');
  expect(await page.evaluate(() => sessionStorage.getItem('riverview_checkout_attempt'))).toBeNull();
});

test('removed payment controls stay unavailable and admin reservations retain details', async ({ page }) => {
  await login(page, 'owner'); await page.goto('/admin/bookings');
  await expect(page.getByRole('link', { name: /Payment review/i })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search reservations' }).fill('DEMO-UPCOMING-001');
  await expect(page.getByText('DEMO-UPCOMING-001', { exact: true })).toBeVisible();
  await page.getByRole('row').filter({ has: page.getByText('DEMO-UPCOMING-001', { exact: true }) }).getByRole('button', { name: 'View', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Reservation Details', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('DEMO-UPCOMING-001'); await fits(page);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  expect((await page.request.get('/api/payment-review')).status()).toBe(404);
  const removedAction = await page.request.post('/api/payment-review/rv-de000000-0000-4000-8000-000000000002/refund', { headers: { Origin: 'http://127.0.0.1:5501' }, data: { note: 'Synthetic absence check' } });
  expect(removedAction.status()).toBe(404);
  await page.goto('/admin/payments'); await expect(page).not.toHaveURL(/\/admin\/payments/);
});

test('staff reads operations and cannot access financial management', async ({ page }) => {
  await login(page, 'staff'); await page.goto('/admin/monitor');
  await expect(page.getByRole('button', { name: 'View details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(page.getByText('Synthetic, Walk-in')).toBeVisible(); await page.keyboard.press('Escape'); await fits(page);
  await page.goto('/admin/bookings'); await expect(page.getByRole('textbox', { name: 'Search reservations' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search reservations' }).fill('DEMO-UPCOMING-001');
  await expect(page.getByText('DEMO-UPCOMING-001', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/reports?from=2026-10-01&to=2026-10-08')).status()).toBe(403);
  await page.goto('/admin/payments'); await expect(page).not.toHaveURL(/\/admin\/payments/);
});

test('forecasts show synthetic evidence and a heuristic range in both themes', async ({ page }, testInfo) => {
  await login(page, 'owner'); await page.goto('/admin/forecasting');
  await expect(page.getByText('Forecast evaluation', { exact: true })).toBeVisible();
  await expect(page.getByText(/synthetic/i).first()).toBeVisible();
  await expect(page.getByText(/80% confidence/i)).toHaveCount(0);
  await capture(page, 'forecast', testInfo); await fits(page);
  const toggle = page.locator('#admin-theme-toggle');
  await toggle.click(); await fits(page);
});

test('session outage preserves identity and failed logout remains actionable', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  await login(page);
  await page.route('**/api/auth/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Session temporarily unavailable"}' }));
  await page.reload();
  await expect(page.getByText('We could not verify your session right now. Try again.')).toBeVisible();
  if (mobile) { await page.getByRole('button', { name: 'Open menu', exact: true }).click(); await expect(page.getByRole('button', { name: 'Account & reservations' })).toBeVisible(); await page.keyboard.press('Escape'); }
  else await expect(page.getByRole('button', { name: /Account menu for Demo Customer/ })).toBeVisible();
  await page.unroute('**/api/auth/me'); await page.getByRole('button', { name: 'Retry session check' }).click();
  await expect(page.getByText('We could not verify your session right now. Try again.')).toHaveCount(0);
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Logout temporarily unavailable"}' }));
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); });
  await page.getByRole('button', { name: mobile ? 'Open menu' : /Account menu for Demo Customer/ }).click();
  await page.getByRole('button', { name: /Log out|Sign out/ }).first().click();
  await page.getByRole('button', { name: 'Log out', exact: true }).last().click();
  await expect(page.getByText('We could not sign you out. Please try again.').first()).toBeVisible();
  await page.unroute('**/api/auth/logout'); await page.getByRole('dialog', { name: 'Log out?' }).getByRole('button', { name: 'Retry sign out' }).click();
  await expect(page.getByRole('button', { name: /Account menu for Demo Customer/ })).toHaveCount(0);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});

test('public and staff pages fit the viewport and retain theme and keyboard controls', async ({ page }, testInfo) => {
  for (const route of ['/', '/rooms', `/rooms/${ROOM}`, '/login']) {
    await page.goto(route); await expect(page.locator('main')).toBeVisible(); await fits(page);
    if (route === '/') await expect(page.locator('.hero-carousel-frame img[loading="eager"]').first()).toHaveAttribute('fetchpriority', 'high');
    await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    if (route !== '/login') {
      if (testInfo.project.name === 'mobile') { await page.getByRole('button', { name: 'Open menu', exact: true }).click(); await page.locator('#mobile-theme-toggle').click(); await page.keyboard.press('Escape'); }
      else await page.locator('#nav-theme-toggle').click();
      await fits(page);
    }
  }
  await login(page, 'owner');
  for (const route of ['/admin/monitor', '/admin/bookings', '/admin/forecasting']) { await page.goto(route); await expect(page.locator('#main')).toBeVisible(); await fits(page); await page.locator('#admin-theme-toggle').click(); await fits(page); }
});
