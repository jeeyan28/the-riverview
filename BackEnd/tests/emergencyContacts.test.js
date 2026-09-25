const test = require('node:test');
const assert = require('node:assert/strict');
const Settings = require('../model/settings');
const User = require('../model/user');
const { createEmergencyContactSchema, updateEmergencyContactSchema } = require('../validation/settingsSchemas');
const { ensureAdmin, requirePermission } = require('../middleware/adminAuth');

test('emergency contacts start empty on the settings singleton', () => {
  const settings = new Settings({ _id: 'global' });
  assert.deepEqual(settings.emergencyContacts, []);
});

test('emergency contact validation accepts local and national dial numbers', () => {
  const base = { category: 'fire', name: 'San Rafael Fire Station', details: 'Local station' };
  assert.equal(createEmergencyContactSchema.validate({ ...base, phone: '(044) 123 4567' }).error, undefined);
  assert.equal(createEmergencyContactSchema.validate({ ...base, phone: '911' }).error, undefined);
  assert.equal(createEmergencyContactSchema.validate({ ...base, phone: '+63 917 123 4567' }).error, undefined);
  assert.ok(createEmergencyContactSchema.validate({ ...base, phone: 'call me' }).error);
  assert.ok(createEmergencyContactSchema.validate({ ...base, phone: '++123' }).error);
  assert.ok(createEmergencyContactSchema.validate({ ...base, phone: '--1--' }).error);
  assert.ok(createEmergencyContactSchema.validate({ ...base, category: 'unknown', phone: '911' }).error);
  assert.ok(updateEmergencyContactSchema.validate({}).error);
});

test('admin-only read and management-only write guards enforce directory access', async () => {
  const originalFindById = User.findById;
  const check = (role, middleware) => new Promise((resolve) => {
    User.findById = async () => ({ role, isActive: true });
    const req = { session: { userId: 'user-id', cookie: {} } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() { resolve(this.statusCode); } };
    middleware(req, res, () => resolve(200));
  });
  try {
    assert.equal(await check('user', ensureAdmin), 403);
    for (const role of ['staff', 'manager', 'super_admin']) assert.equal(await check(role, ensureAdmin), 200);
    assert.equal(await check('staff', requirePermission('settings:manage')), 403);
    assert.equal(await check('manager', requirePermission('settings:manage')), 200);
    assert.equal(await check('super_admin', requirePermission('settings:manage')), 200);
  } finally {
    User.findById = originalFindById;
  }
});
