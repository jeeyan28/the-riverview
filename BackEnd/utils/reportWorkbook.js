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

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const EXCEL_EPOCH_OFFSET = 25569;

function formatActivityTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) return value || '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function unitKey({ facilityName, roomType, unitNumber }) {
  return `${facilityName || 'Other'}\u0000${roomType || 'Standard'}\u0000${unitNumber ?? ''}`;
}

function unitNumberCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function uniqueSheetName(value, usedNames) {
  const base = String(value || 'Monitoring').replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Monitoring';
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const marker = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function excelManilaSerial(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const local = new Date(parsed.getTime() + MANILA_OFFSET_MS);
  return Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
  ) / DAY_MS + EXCEL_EPOCH_OFFSET;
}

function addMonitoringGridSheets(workbook, rows = [], inventory = [], range = {}) {
  const units = new Map();
  const addUnit = (item) => {
    const normalized = {
      facilityName: item.facilityName || 'Other',
      roomType: item.roomType || item.roomName || 'Standard',
      unitNumber: item.unitNumber ?? '',
    };
    const key = unitKey(normalized);
    if (!units.has(key)) units.set(key, { ...normalized, rows: [] });
    return units.get(key);
  };

  inventory.forEach(addUnit);
  rows.forEach((row) => addUnit(row).rows.push(row));

  const facilities = new Map();
  for (const unit of units.values()) {
    if (!facilities.has(unit.facilityName)) facilities.set(unit.facilityName, []);
    facilities.get(unit.facilityName).push(unit);
  }

  const usedNames = new Set(workbook.worksheets.map((sheet) => sheet.name.toLowerCase()));
  const singleDay = range.from && range.from === range.to;
  const gridBorder = {
    top: { style: 'thin', color: { argb: '666666' } },
    left: { style: 'thin', color: { argb: '666666' } },
    bottom: { style: 'thin', color: { argb: '666666' } },
    right: { style: 'thin', color: { argb: '666666' } },
  };

  for (const [facilityName, facilityUnits] of [...facilities.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    facilityUnits.sort((a, b) => a.roomType.localeCompare(b.roomType) || unitNumberCompare(a.unitNumber, b.unitNumber));
    const unitColumns = facilityUnits.length * 3;
    const totalColumns = Math.max(21, unitColumns);
    const maxSessionRows = Math.max(0, ...facilityUnits.map((unit) => unit.rows.length));
    const lastRow = Math.max(27, 4 + maxSessionRows);
    const sheet = workbook.addWorksheet(uniqueSheetName(facilityName, usedNames), { views: [{ showGridLines: true }] });

    for (let column = 1; column <= totalColumns; column += 1) sheet.getColumn(column).width = 15;
    sheet.getRow(1).height = 34.5;
    sheet.getRow(2).height = 33.75;
    sheet.mergeCells(1, 1, 1, totalColumns);
    const title = sheet.getCell(1, 1);
    title.value = facilityName;
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.font = { name: 'Arial', size: 14, bold: true, color: { argb: COLORS.ink } };

    let unitIndex = 0;
    let roomTypeStart = 0;
    while (roomTypeStart < facilityUnits.length) {
      const roomType = facilityUnits[roomTypeStart].roomType;
      let roomTypeEnd = roomTypeStart;
      while (roomTypeEnd + 1 < facilityUnits.length && facilityUnits[roomTypeEnd + 1].roomType === roomType) roomTypeEnd += 1;
      const startColumn = roomTypeStart * 3 + 1;
      const endColumn = (roomTypeEnd + 1) * 3;
      sheet.mergeCells(2, startColumn, 2, endColumn);
      const groupCell = sheet.getCell(2, startColumn);
      groupCell.value = roomType;
      groupCell.alignment = { horizontal: 'center', vertical: 'middle' };
      groupCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: COLORS.ink } };
      roomTypeStart = roomTypeEnd + 1;
    }

    for (const unit of facilityUnits) {
      const startColumn = unitIndex * 3 + 1;
      const revenueColumn = startColumn + 2;
      sheet.mergeCells(3, startColumn, 3, startColumn + 1);
      const unitCell = sheet.getCell(3, startColumn);
      unitCell.value = `Table ${unit.unitNumber}`;
      unitCell.alignment = { horizontal: 'center', vertical: 'middle' };
      unitCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.ink } };

      const totalCharge = unit.rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      const revenueCell = sheet.getCell(3, revenueColumn);
      revenueCell.value = totalCharge || null;
      revenueCell.numFmt = '"₱"#,##0.##;[Red]-"₱"#,##0.##';
      revenueCell.alignment = { horizontal: 'center', vertical: 'middle' };

      ['Time In', 'Time out', 'No. of Hrs'].forEach((label, offset) => {
        const cell = sheet.getCell(4, startColumn + offset);
        cell.value = label;
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.ink } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      unit.rows.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).forEach((row, rowIndex) => {
        const outputRow = 5 + rowIndex;
        const startSerial = excelManilaSerial(row.startTime);
        const endSerial = excelManilaSerial(row.scheduledEndTime || new Date(new Date(row.startTime).getTime() + (Number(row.duration) || 0) * 60 * 60 * 1000));
        const timeFormat = singleDay ? 'h:mm AM/PM' : 'm/d/yyyy h:mm AM/PM';
        const startCell = sheet.getCell(outputRow, startColumn);
        const endCell = sheet.getCell(outputRow, startColumn + 1);
        startCell.value = singleDay && startSerial != null ? startSerial % 1 : startSerial;
        endCell.value = singleDay && endSerial != null ? endSerial % 1 : endSerial;
        startCell.numFmt = timeFormat;
        endCell.numFmt = timeFormat;
        sheet.getCell(outputRow, revenueColumn).value = Number(row.duration) || 0;
      });
      unitIndex += 1;
    }

    for (let row = 2; row <= lastRow; row += 1) {
      for (let column = 1; column <= unitColumns; column += 1) {
        const cell = sheet.getCell(row, column);
        cell.border = gridBorder;
        cell.alignment = { ...cell.alignment, vertical: 'middle', horizontal: cell.alignment?.horizontal || 'center' };
        cell.font = { name: 'Arial', size: cell.font?.size || 10, bold: cell.font?.bold || false, color: { argb: COLORS.ink } };
      }
    }

    sheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    };
  }
}

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

function addActivitySheet(workbook, rows, { name = 'Sessions', includeReview = false, includeBalance = true } = {}) {
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
    ...(includeBalance ? [{ header: 'Balance', key: 'balance', width: 14 }] : []),
    { header: 'Payment', key: 'paymentStatus', width: 13 },
    { header: 'Timing', key: 'paymentTiming', width: 13 },
    { header: 'Session status', key: 'status', width: 15 },
    { header: 'Reference', key: 'reference', width: 23 },
  ];
  if (includeReview) columns.push({ header: 'Review note', key: 'review', width: 50 });
  sheet.columns = columns;
  sheet.addRows(rows.map((row) => ({
    ...row,
    timeIn: formatActivityTime(row.timeIn),
    timeOut: formatActivityTime(row.timeOut),
    roomType: row.roomType || row.roomName || '',
    unitNumber: row.unitNumber || '',
    sourceLabel: row.source === 'booking' ? 'Reservation' : 'Walk-in',
    rateLabel: row.rateLabel || (row.duration ? `₱${(Number(row.amount || 0) / Number(row.duration)).toFixed(2)}/hr` : ''),
    paymentTiming: row.paymentTiming || '',
    review: (row.warnings || []).join(' '),
  })));
  styleHeading(sheet.getRow(1));
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
  for (const key of ['amount', 'collected', ...(includeBalance ? ['balance'] : [])]) sheet.getColumn(key).numFmt = '"₱"#,##0.00';
  sheet.getColumn('duration').numFmt = '0.00';
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    if (index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F6F8FB' } };
  });
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return sheet;
}

function addRoomTypeSheet(workbook, rows, name = 'Room totals', { includeBalance = true } = {}) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  sheet.columns = [
    { header: 'Facility', key: 'facilityName', width: 24 },
    { header: 'Room type', key: 'roomType', width: 24 },
    { header: 'Sessions', key: 'sessions', width: 12 },
    { header: 'Hours', key: 'hours', width: 12 },
    { header: 'Charges', key: 'charged', width: 16 },
    { header: 'Collected', key: 'collected', width: 16 },
    ...(includeBalance ? [{ header: 'Balance', key: 'outstanding', width: 16 }] : []),
  ];
  sheet.addRows(rows);
  styleHeading(sheet.getRow(1), COLORS.teal);
  for (const key of ['charged', 'collected', ...(includeBalance ? ['outstanding'] : [])]) sheet.getColumn(key).numFmt = '"₱"#,##0.00';
  return sheet;
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'The Riverview';
  workbook.created = new Date();
  return workbook;
}

module.exports = { createWorkbook, addMonitoringGridSheets, addSummarySheet, addActivitySheet, addRoomTypeSheet, styleHeading };
