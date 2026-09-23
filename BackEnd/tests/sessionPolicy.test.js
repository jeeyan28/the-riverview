const test = require('node:test');
const assert = require('node:assert/strict');
const { STAFF_SESSION_MS, CUSTOMER_SESSION_MS, setAuthenticatedSession, refreshSessionLifetime } = require('../utils/sessionPolicy');

test('customer and guest sign-ins persist across visits while staff keeps the shorter session', () => {
  for (const user of [
    { _id: 'customer-id', role: 'user', isGuest: false },
    { _id: 'guest-id', role: 'user', isGuest: true },
  ]) {
    const req = { session: { cookie: {} } };
    setAuthenticatedSession(req, user);
    assert.equal(req.session.userId, user._id);
    assert.equal(req.session.cookie.maxAge, CUSTOMER_SESSION_MS);
  }

  const staffRequest = { session: { cookie: {} } };
  setAuthenticatedSession(staffRequest, { _id: 'staff-id', role: 'staff' });
  assert.equal(staffRequest.session.cookie.maxAge, STAFF_SESSION_MS);
});

test('revalidating an existing customer session extends its lifetime', () => {
  const req = { session: { cookie: { maxAge: STAFF_SESSION_MS } } };
  refreshSessionLifetime(req, { role: 'user' });
  assert.equal(req.session.cookie.maxAge, CUSTOMER_SESSION_MS);
});
