const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../../model/user');
const { ensureAuthenticated, requirePermission } = require('../../middleware/adminAuth');

const id = '507f1f77bcf86cd799439011';
function response() {
  return { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}
test('missing and malformed sessions are actual authentication failures', async () => {
  for (const session of [undefined, {}, { userId: 'invalid' }]) {
    const res = response();
    await ensureAuthenticated({ session }, res, () => assert.fail('must not authorize'));
    assert.equal(res.statusCode, 401);
  }
});
test('absent, deactivated, unverified and invalidated accounts cannot authorize', async t => {
  for (const user of [null, { isActive: false }, { isActive: true, isVerified: false }, { isActive: true, isVerified: true, sessionVersion: 'new' }]) {
    t.mock.method(User, 'findOne', async () => user);
    const res = response();
    await ensureAuthenticated({ session: { userId: id, sessionVersion: 'old', destroy() {} } }, res, () => assert.fail('must not authorize'));
    assert.equal(res.statusCode, 401);
    t.mock.restoreAll();
  }
});
test('database lookup failure is a recoverable service error with correlation ID', async t => {
  t.mock.method(User, 'findOne', async () => { throw new Error('private database credentials'); });
  const res = response();
  await ensureAuthenticated({ id: 'fixture-request', session: { userId: id } }, res, () => assert.fail('must not authorize'));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SESSION_UNAVAILABLE');
  assert.equal(res.body.requestId, 'fixture-request');
  assert.doesNotMatch(JSON.stringify(res.body), /credentials/);
});
test('finance permissions are enforced by the server for staff', async t => {
  t.mock.method(User, 'findOne', async () => ({ _id: id, isActive: true, isVerified: true, role: 'staff' }));
  const res = response();
  requirePermission('pos:refund')({ session: { userId: id, cookie: {} } }, res, () => assert.fail('must not authorize'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(res.statusCode, 403);
});
test('logout succeeds only after session deletion and can safely retry failure', async () => {
  const app = express();
  app.use(express.json());
  let fail = true, destroyed = 0;
  app.use((req, res, next) => {
    req.session = { destroy(callback) { destroyed++; callback(fail ? new Error('store unavailable') : null); } };
    next();
  });
  app.use('/auth', require('../../routes/auth'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/auth/logout`;
    const failed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).code, 'LOGOUT_UNAVAILABLE');
    assert.equal(failed.headers.get('set-cookie'), null);
    fail = false;
    const success = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(success.status, 200);
    assert.match(success.headers.get('set-cookie'), /connect.sid=;/);
    assert.equal(destroyed, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
