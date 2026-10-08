const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertIsolatedDatabase, assertDemoEnvironment } = require('../../utils/isolatedDatabase');
test('test cleanup refuses absent, normal, remote and demo databases', () => {
  for (const uri of ['', 'mongodb://localhost/riverview', 'mongodb://localhost/riverview_demo_local', 'mongodb://db.example/riverview_test_local']) {
    assert.throws(() => assertIsolatedDatabase(uri, 'test'));
  }
  assert.equal(assertIsolatedDatabase('mongodb://127.0.0.1:27017/riverview_test_local', 'test'), 'riverview_test_local');
});
test('demo isolation rejects production and live service credentials', () => {
  const env = { APP_MODE: 'demo', DEMO_MONGO_URI: 'mongodb://localhost/riverview_demo_local', NODE_ENV: 'development' };
  assert.equal(assertDemoEnvironment(env), true);
  for (const name of ['PAYMONGO_SECRET_KEY', 'XENDIT_SECRET_KEY', 'GMAIL_APP_PASSWORD', 'CLOUDINARY_API_SECRET']) {
    assert.throws(() => assertDemoEnvironment({ ...env, [name]: 'fixture' }));
  }
  assert.throws(() => assertDemoEnvironment({ ...env, NODE_ENV: 'production' }));
});
