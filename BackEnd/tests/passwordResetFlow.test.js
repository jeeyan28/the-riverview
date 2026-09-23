const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const User = require('../model/user');
const LoginHistory = require('../model/loginHistory');
const authRouter = require('../routes/auth');

test('a verified reset saves a password accepted by email login with field-specific errors', async () => {
  const token = crypto.randomBytes(32).toString('hex');
  const password = 'NewSecurePassword123';
  const user = new User({
    firstName: 'Test', lastName: 'Member', email: 'member@example.com',
    isActive: true, isVerified: true,
    resetSessionTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    resetSessionTokenExpires: new Date(Date.now() + 60000),
  });
  user.save = async () => {
    await User.schema.s.hooks.execPre('save', user, []);
    return user;
  };
  user.registerSuccessfulLogin = async () => {};
  user.registerFailedLogin = async () => {};

  const originalFindOne = User.findOne;
  const originalCreate = LoginHistory.create;
  User.findOne = (query) => ({
    select: async () => {
      if (query.email) return query.email === user.email ? user : null;
      return query.resetSessionTokenHash === user.resetSessionTokenHash && query.resetSessionTokenExpires?.$gt < user.resetSessionTokenExpires ? user : null;
    },
  });
  LoginHistory.create = async () => ({});

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { cookie: {}, regenerate: (done) => done(), save: (done) => done() };
    next();
  });
  app.use('/api/auth', authRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${baseUrl}/api/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  try {
    const reset = await post('reset-password', { resetSessionToken: token, password });
    assert.equal(reset.status, 200);
    assert.equal(await user.comparePassword(password), true);
    assert.equal(user.resetSessionTokenHash, undefined);

    const login = await post('login', { email: user.email, password });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.email, user.email);

    const wrongPassword = await post('login', { email: user.email, password: 'WrongPassword123' });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(await wrongPassword.json(), {
      message: 'Incorrect password. Try again or reset it.', field: 'password',
    });

    const unknownEmail = await post('login', { email: 'missing@example.com', password });
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(await unknownEmail.json(), {
      message: 'No account found with this email. Check the address or create an account.', field: 'email',
    });
  } finally {
    User.findOne = originalFindOne;
    LoginHistory.create = originalCreate;
    await new Promise((resolve) => server.close(resolve));
  }
});
