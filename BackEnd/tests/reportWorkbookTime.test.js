const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbook, addActivitySheet } = require('../utils/reportWorkbook');

test('exported activity times display AM and PM without changing source data', () => {
  const source = { date: '2026-09-24', timeIn: '21:52', timeOut: '02:52', duration: 5 };
  const workbook = createWorkbook();
  const sheet = addActivitySheet(workbook, [source]);

  assert.equal(sheet.getRow(2).getCell('timeIn').value, '9:52 PM');
  assert.equal(sheet.getRow(2).getCell('timeOut').value, '2:52 AM');
  assert.equal(source.timeIn, '21:52');
  assert.equal(source.timeOut, '02:52');
});
