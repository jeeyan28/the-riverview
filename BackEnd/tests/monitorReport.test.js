const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMonitorReport } = require('../utils/monitorReport');

test('played-session report includes only finished sessions paid in full', () => {
  const base = {
    _id: 'paid', startTime: new Date('2026-09-23T10:00:00+08:00'), duration: 1,
    amount: 300, paidAmount: 300, refundedAmount: 0, rate: 300,
    facilityName: 'Billiards', roomName: 'Big Rooms', roomNumber: '1', status: 'Finished',
  };
  const report = buildMonitorReport([
    base,
    { ...base, _id: 'unpaid', paidAmount: 0 },
    { ...base, _id: 'partial', paidAmount: 100 },
    { ...base, _id: 'active', status: 'Active' },
  ], { from: '2026-09-23', to: '2026-09-23' });

  assert.deepEqual(report.rows.map((row) => row.id), ['paid']);
  assert.equal(report.rows[0].paymentStatus, 'Paid');
  assert.equal(report.rows[0].balance, 0);
  assert.equal(report.summary.sessions, 1);
  assert.equal(report.summary.collected, 300);
});

test('late arrival report keeps actual check-in and booked check-out', () => {
  const report = buildMonitorReport([{
    _id: 'late', startTime: new Date('2026-09-23T08:15:00+08:00'),
    scheduledEndTime: new Date('2026-09-23T09:00:00+08:00'), duration: 1,
    amount: 150, paidAmount: 150, refundedAmount: 0, rate: 150,
    facilityName: 'Billiards', roomName: 'Shared Room', roomNumber: '1', status: 'Finished',
  }], { from: '2026-09-23', to: '2026-09-23' });
  assert.equal(report.rows[0].timeIn, '8:15 AM');
  assert.equal(report.rows[0].timeOut, '9:00 AM');
});
