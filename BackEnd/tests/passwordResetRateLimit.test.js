const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  forgotPasswordLimiter,
  verifyResetOtpLimiter,
  resetPasswordLimiter,
} = require('../middleware/rateLimiter');

test('three code requests are allowed; the fourth is blocked without blocking later reset stages', async () => {
  const app = express();
  let codesSent = 0;
  app.post('/forgot-password', forgotPasswordLimiter, (_req, res) => {
    codesSent += 1;
    res.json({ message: 'Code sent.' });
  });
  app.post('/verify-otp', verifyResetOtpLimiter, (_req, res) => res.json({ message: 'Verified.' }));
  app.post('/reset-password', resetPasswordLimiter, (_req, res) => res.json({ message: 'Updated.' }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    for (let i = 0; i < 3; i += 1) {
      const response = await fetch(`${baseUrl}/forgot-password`, { method: 'POST' });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('ratelimit-remaining'), String(2 - i));
    }

    const blocked = await fetch(`${baseUrl}/forgot-password`, { method: 'POST' });
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).message, /limit of 3 password reset code requests per hour/);
    assert.equal(codesSent, 3);

    assert.equal((await fetch(`${baseUrl}/verify-otp`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${baseUrl}/reset-password`, { method: 'POST' })).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
