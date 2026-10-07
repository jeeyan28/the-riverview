const BORDER = {
  top: { style: 'thin' },
  bottom: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' },
};

function key(item) {
  return `${item.facilityName}\u0000${item.roomType}\u0000${item.unitNumber}`;
}

function sheetName(value, used) {
  const base = String(value || 'Facility').replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Facility';
  let name = base;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    const end = ` ${suffix++}`;
    name = `${base.slice(0, 31 - end.length)}${end}`;
  }
  used.add(name.toLowerCase());
  return name;
}

function manilaExcelTime(value, daily) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const serial = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), local.getUTCHours(), local.getUTCMinutes()) / 86400000 + 25569;
  return daily ? serial % 1 : serial;
}

function reportDateLabel(value) {
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return value;
  return `${Number(month)}-${Number(day)}-${year}`;
}

function addDailyMonitorWorkbook(workbook, rows, inventory, range) {
  const units = new Map(inventory.map((room) => [key(room), { ...room, sessions: [] }]));
  for (const row of rows) units.get(key(row))?.sessions.push(row);
  const facilities = new Map();
  for (const unit of units.values()) {
    if (!facilities.has(unit.facilityName)) facilities.set(unit.facilityName, []);
    facilities.get(unit.facilityName).push(unit);
  }

  const summary = workbook.addWorksheet('Summary');
  summary.mergeCells('A1:M1');
  summary.getCell('A1').value = `The Riverview - Summary Report (Date ${range.from === range.to ? reportDateLabel(range.from) : `${reportDateLabel(range.from)} to ${reportDateLabel(range.to)}`})`;
  summary.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
  summary.getCell('A2').value = 'Facilities';
  summary.getCell('B2').value = 'Sales';
  summary.getRow(2).font = { name: 'Arial', size: 11, bold: true };
  summary.getColumn(1).width = 25;
  summary.getColumn(2).width = 18;

  const daily = range.from === range.to;
  let summaryRow = 3;
  const sheetNames = new Set(['summary']);
  for (const [facilityName, facilityUnits] of [...facilities].sort(([a], [b]) => a.localeCompare(b))) {
    facilityUnits.sort((a, b) => a.roomType.localeCompare(b.roomType) || String(a.unitNumber).localeCompare(String(b.unitNumber), undefined, { numeric: true }));
    const sales = facilityUnits.flatMap((unit) => unit.sessions).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    summary.getCell(summaryRow, 1).value = facilityName;
    summary.getCell(summaryRow, 2).value = Math.round(sales * 100) / 100;
    summary.getCell(summaryRow, 2).numFmt = '"₱"#,##0.00';
    summaryRow += 1;

    const sheet = workbook.addWorksheet(sheetName(facilityName, sheetNames));
    const bands = [];
    for (let offset = 0; offset < facilityUnits.length; offset += 7) {
      const units = facilityUnits.slice(offset, offset + 7);
      let nextColumn = 1;
      const positions = units.map((unit, index) => {
        if (index && unit.roomType !== units[index - 1].roomType) nextColumn += 1;
        const column = nextColumn;
        nextColumn += 3;
        return column;
      });
      bands.push({ units, positions, width: nextColumn - 1 });
    }
    const columns = Math.max(21, ...bands.map((band) => band.width));
    for (let col = 1; col <= columns; col += 1) sheet.getColumn(col).width = 15;
    sheet.mergeCells(1, 1, 1, columns);
    sheet.getCell(1, 1).value = facilityName;
    sheet.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true };
    sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 32;

    let nextBandRow = 2;
    for (const band of bands) {
      const sectionRow = nextBandRow;
      let groupStart = 0;
      while (groupStart < band.units.length) {
        let groupEnd = groupStart;
        while (groupEnd + 1 < band.units.length && band.units[groupEnd + 1].roomType === band.units[groupStart].roomType) groupEnd += 1;
        const fromColumn = band.positions[groupStart];
        const toColumn = band.positions[groupEnd] + 2;
        sheet.mergeCells(sectionRow, fromColumn, sectionRow, toColumn);
        sheet.getCell(sectionRow, fromColumn).value = band.units[groupStart].roomType;
        sheet.getCell(sectionRow, fromColumn).font = { name: 'Arial', size: 11, bold: true };
        sheet.getCell(sectionRow, fromColumn).alignment = { horizontal: 'center', vertical: 'middle' };
        groupStart = groupEnd + 1;
      }
      band.units.forEach((unit, index) => {
        const col = band.positions[index];
        sheet.mergeCells(sectionRow + 1, col, sectionRow + 1, col + 2);
        sheet.getCell(sectionRow + 1, col).value = `Table ${unit.unitNumber}`;
        sheet.getCell(sectionRow + 1, col).font = { name: 'Arial', size: 10, bold: true };
        sheet.getCell(sectionRow + 1, col).alignment = { horizontal: 'center', vertical: 'middle' };
        ['Time In', 'Time out', 'Rate'].forEach((label, cellIndex) => {
          const cell = sheet.getCell(sectionRow + 2, col + cellIndex);
          cell.value = label;
          cell.font = { name: 'Arial', size: 10, bold: true };
        });
        unit.sessions.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).forEach((session, rowIndex) => {
          const outputRow = sectionRow + 3 + rowIndex;
          const end = session.scheduledEndTime || new Date(new Date(session.startTime).getTime() + Number(session.duration || 0) * 3600000);
          for (const [cellIndex, value] of [[0, session.startTime], [1, end]]) {
            const cell = sheet.getCell(outputRow, col + cellIndex);
            cell.value = manilaExcelTime(value, daily);
            cell.numFmt = daily ? 'h:mm AM/PM' : 'm/d/yyyy h:mm AM/PM';
          }
          const rate = sheet.getCell(outputRow, col + 2);
          rate.value = Number(session.amount || 0);
          rate.numFmt = '"₱"#,##0.00';
        });
      });
      const lastRow = Math.max(sectionRow + 14, sectionRow + 2 + Math.max(0, ...band.units.map((unit) => unit.sessions.length)));
      for (let row = sectionRow; row <= lastRow; row += 1) {
        for (const col of band.positions) {
          for (let cell = col; cell <= col + 2; cell += 1) sheet.getCell(row, cell).border = BORDER;
        }
      }
      nextBandRow = lastRow + 1;
    }
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
}

module.exports = { addDailyMonitorWorkbook };
