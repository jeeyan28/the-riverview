const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../../model/user');
const Room = require('../../model/room');
const roomRoutes = require('../../routes/roomRoutes');

const id = '507f1f77bcf86cd799439011';
const restores = [];
let server, base, findFilter;

function stub(target, key, replacement) {
  const original = target[key];
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
}

before(async () => {
  stub(User, 'findOne', async () => ({ _id: id, role: 'staff', isActive: true }));
  stub(Room, 'find', (filter) => {
    findFilter = filter;
    return { sort: async () => [{ _id: id, name: 'Court', variants: [] }] };
  });
  const app = express();
  app.use((req, _res, next) => {
    req.session = { userId: id, cookie: {} };
    next();
  });
  app.use('/rooms', roomRoutes);
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}/rooms`;
});

after(async () => {
  restores.reverse().forEach((restore) => restore());
  await new Promise((resolve) => server.close(resolve));
});

test('booking staff can load the full facility catalog for manual reservations', async () => {
  const response = await fetch(`${base}/admin`);
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].name, 'Court');
  assert.equal(findFilter, undefined);
});
