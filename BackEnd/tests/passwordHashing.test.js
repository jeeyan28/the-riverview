const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const User = require('../model/user');

function makeUser() {
  return new User({ firstName: 'Test', lastName: 'User', email: 'test@example.invalid' });
}

async function runSaveMiddleware(user) {
  await User.schema.s.hooks.execPre('save', user, []);
}

test('a password set during reset remains valid after saving', async () => {
  const user = makeUser();
  await user.setPassword('NewPassword123');
  await runSaveMiddleware(user);

  assert.equal(await user.comparePassword('NewPassword123'), true);
  assert.equal(await user.comparePassword('WrongPassword123'), false);
});

test('an already hashed registration password is not hashed again', async () => {
  const user = makeUser();
  user.setPasswordHash(await bcrypt.hash('NewPassword123', User.SALT_ROUNDS));
  await runSaveMiddleware(user);

  assert.equal(await user.comparePassword('NewPassword123'), true);
});
