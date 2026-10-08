const { test } = require('node:test');
const assert = require('node:assert/strict');
const { minorUnits } = require('../../utils/paymentAttempts');
const { verifyWebhookToken } = require('../../utils/xendit');
const { verifyWebhookSignature } = require('../../utils/paymongo');
const { createHmac } = require('node:crypto');
test('minor-unit conversion rounds PHP centavos and refuses invalid amounts', () => {
  assert.equal(minorUnits(300.25), 30025);
  for (const amount of [0, -1, NaN, Infinity, Number.MAX_VALUE]) assert.throws(() => minorUnits(amount));
});
test('callback authentication rejects altered payloads and incorrect tokens', t => {
  const previous = { XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN, PAYMONGO_WEBHOOK_SECRET: process.env.PAYMONGO_WEBHOOK_SECRET };
  process.env.XENDIT_WEBHOOK_TOKEN = 'fixture-token';
  process.env.PAYMONGO_WEBHOOK_SECRET = 'fixture-signing-secret';
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  assert.equal(verifyWebhookToken('fixture-token'), true);
  assert.equal(verifyWebhookToken('wrong'), false);
  const body = '{"data":{}}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', 'fixture-signing-secret').update(`${timestamp}.${body}`).digest('hex');
  assert.doesNotThrow(() => verifyWebhookSignature(body, `t=${timestamp},te=${signature}`));
  assert.throws(() => verifyWebhookSignature('{}', `t=${timestamp},te=${signature}`));
  assert.throws(() => verifyWebhookSignature(body, ''));
  const stale = String(Number(timestamp) - 301);
  const staleSignature = createHmac('sha256', 'fixture-signing-secret').update(`${stale}.${body}`).digest('hex');
  assert.throws(() => verifyWebhookSignature(body, `t=${stale},te=${staleSignature}`), /timestamp/);
});
