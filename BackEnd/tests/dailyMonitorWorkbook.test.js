const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbook } = require('../utils/reportWorkbook');
const { addDailyMonitorWorkbook } = require('../utils/dailyMonitorWorkbook');
const { currentMonitorInventory } = require('../utils/monitorReport');

test('current inventory excludes removed, inactive, and temporary rooms', () => {
  const inventory = [
    { facilityName: 'Billiards', roomName: 'Shared Room', roomNumber: '1', status: 'Available' },
    { facilityName: 'Billiards', roomName: 'Removed Room', roomNumber: '1', status: 'Occupied' },
    { facilityName: 'Billiards', roomName: 'Shared Room', roomNumber: '2', status: 'Inactive' },
    { facilityName: 'Billiards', roomName: 'Shared Room', roomNumber: '3', status: 'Available', isTemporary: true },
  ];
  const catalog = [{ name: 'Billiards', variants: [{ label: 'Shared Room', roomCount: 3 }] }];
  assert.deepEqual(currentMonitorInventory(inventory, catalog), [inventory[0]]);
});

test('daily room export has only summary and current facility sheets with the template columns', () => {
  const workbook = createWorkbook();
  const inventory = [
    { facilityName: 'Billiards', roomType: 'Shared Room', unitNumber: '1' },
    { facilityName: 'Billiards', roomType: 'Solo Regular', unitNumber: '1' },
  ];
  const rows = [
    { ...inventory[0], startTime: '2026-09-25T02:00:00.000Z', scheduledEndTime: '2026-09-25T04:00:00.000Z', amount: 300 },
    { facilityName: 'Removed Court', roomType: 'Old Room', unitNumber: '1', startTime: '2026-09-25T02:00:00.000Z', amount: 200 },
  ];
  addDailyMonitorWorkbook(workbook, rows, inventory, { from: '2026-09-25', to: '2026-09-25' });

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Billiards']);
  assert.equal(workbook.getWorksheet('Summary').getCell('B3').value, 300);
  assert.equal(
    workbook.getWorksheet('Summary').getCell('A1').value,
    'The Riverview - Summary Report (Date 9-25-2026)'
  );
  const billiards = workbook.getWorksheet('Billiards');
  assert.equal(billiards.getCell('A1').value, 'Billiards');
  assert.equal(billiards.getCell('A3').value, 'Table 1');
  assert.equal(billiards.getCell('E2').value, 'Solo Regular');
  assert.equal(billiards.getCell('E3').value, 'Table 1');
  assert.equal(billiards.getCell('D3').value, null);
  assert.deepEqual(['A4', 'B4', 'C4'].map((cell) => billiards.getCell(cell).value), ['Time In', 'Time out', 'Rate']);
  assert.equal(billiards.getCell('C5').value, 300);
  assert.ok(Math.abs(billiards.getCell('A5').value - 10 / 24) < 1e-9);
});
