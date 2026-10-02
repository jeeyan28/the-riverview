const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const auth = require('../routes/auth');
const users = require('../routes/userRoutes');

test('retired account creation, claiming, recovery and cleanup endpoints return 404', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', auth);
  app.use('/api/users', users);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    '/api/auth/guest', '/api/auth/guest-recovery-login',
    '/api/auth/guest/claim/email/start', '/api/auth/guest/claim/email/resend-otp',
    '/api/auth/guest/claim/email/verify-otp', '/api/auth/guest/claim/google',
    '/api/users/507f1f77bcf86cd799439011/recover', '/api/users/guests/cleanup-now',
  ]) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404, path);
  }
});
