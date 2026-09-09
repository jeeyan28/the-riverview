const ExcelJS = require('exceljs');

const COLORS = {
  navy: '16243D',
  navySoft: 'E8EDF4',
  teal: '16857A',
  tealSoft: 'DDF3EF',
  white: 'FFFFFF',
  ink: '172033',
  muted: '5F6B7C',
  line: 'D9E1EA',
};

function styleHeading(row, fill = COLORS.navy) {
  row.height = 25;
  row.font = { bold: true, color: { argb: COLORS.white } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  row.alignment = { vertical: 'middle' };
}

function styleTitle(sheet, title, subtitle) {
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18, color: { argb: COLORS.navy } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 32;
  sheet.mergeCells('A2:F2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = subtitle;
  subtitleCell.font = { size: 10, color: { argb: COLORS.muted } };
  sheet.getRow(2).height = 24;
}

function addSummarySheet(workbook, { title, range, metrics, notes = [] }) {
  const sheet = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 31 }, { width: 26 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];
  styleTitle(sheet, title, `${range.from} to ${range.to} · service dates · Asia/Manila`);
  const header = sheet.addRow(['Metric', 'Value']);
  styleHeading(header, COLORS.teal);
  for (const metric of metrics) {
    const row = sheet.addRow([metric.label, metric.value]);
    row.getCell(1).font = { bold: true, color: { argb: COLORS.ink } };
    if (metric.format === 'money') row.getCell(2).numFmt = '"₱"#,##0.00';
    if (metric.format === 'hours') row.getCell(2).numFmt = '0.00" h"';
  }
  if (notes.length) {
    sheet.addRow([]);
    const noteHeading = sheet.addRow(['Notes']);
    noteHeading.getCell(1).font = { bold: true, color: { argb: COLORS.navy } };
    for (const note of notes) {
      const row = sheet.addRow([note]);
      sheet.mergeCells(`A${row.number}:F${row.number}`);
      row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    }
  }
  return sheet;
}

function addActivitySheet(workbook, rows, { name = 'Sessions', includeReview = false } = {}) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  const columns = [
    { header: 'Date', key: 'date', width: 13 },
    { header: 'Time in', key: 'timeIn', width: 12 },
    { header: 'Time out', key: 'timeOut', width: 12 },
    { header: 'Facility', key: 'facilityName', width: 20 },
    { header: 'Room type', key: 'roomType', width: 20 },
    { header: 'Unit', key: 'unitNumber', width: 10 },
    { header: 'Guest', key: 'guestName', width: 24 },
    { header: 'Source', key: 'sourceLabel', width: 14 },
    { header: 'Hours', key: 'duration', width: 9 },
    { header: 'Rate / hour', key: 'rateLabel', width: 24 },
    { header: 'Charge', key: 'amount', width: 14 },
    { header: 'Paid', key: 'collected', width: 14 },
    { header: 'Balance', key: 'balance', width: 14 },
    { header: 'Payment', key: 'paymentStatus', width: 13 },
    { header: 'Timing', key: 'paymentTiming', width: 13 },
    { header: 'Session status', key: 'status', width: 15 },
    { header: 'Reference', key: 'reference', width: 23 },
  ];
  if (includeReview) columns.push({ header: 'Review note', key: 'review', width: 50 });
  sheet.columns = columns;
  sheet.addRows(rows.map((row) => ({
    ...row,
    roomType: row.roomType || row.roomName || '',
    unitNumber: row.unitNumber || '',
    timeOut: row.timeOut || '',
    sourceLabel: row.source === 'booking' ? 'Reservation' : 'Walk-in',
    rateLabel: row.rateLabel || (row.duration ? `₱${(Number(row.amount || 0) / Number(row.duration)).toFixed(2)}/hr` : ''),
    paymentTiming: row.paymentTiming || '',
    review: (row.warnings || []).join(' '),
  })));
  styleHeading(sheet.getRow(1));
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
  for (const key of ['amount', 'collected', 'balance']) sheet.getColumn(key).numFmt = '"₱"#,##0.00';
  sheet.getColumn('duration').numFmt = '0.00';
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    if (index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F6F8FB' } };
  });
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return sheet;
}

function addRoomTypeSheet(workbook, rows, name = 'Room totals') {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  sheet.columns = [
    { header: 'Facility', key: 'facilityName', width: 24 },
    { header: 'Room type', key: 'roomType', width: 24 },
    { header: 'Sessions', key: 'sessions', width: 12 },
    { header: 'Hours', key: 'hours', width: 12 },
    { header: 'Charges', key: 'charged', width: 16 },
    { header: 'Collected', key: 'collected', width: 16 },
    { header: 'Balance', key: 'outstanding', width: 16 },
  ];
  sheet.addRows(rows);
  styleHeading(sheet.getRow(1), COLORS.teal);
  for (const key of ['charged', 'collected', 'outstanding']) sheet.getColumn(key).numFmt = '"₱"#,##0.00';
  return sheet;
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'The Riverview';
  workbook.created = new Date();
  return workbook;
}

module.exports = { createWorkbook, addSummarySheet, addActivitySheet, addRoomTypeSheet, styleHeading };
