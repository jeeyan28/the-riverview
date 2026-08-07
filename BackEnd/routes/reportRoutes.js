const express = require("express");
const ExcelJS = require("exceljs");
const { RoomSession } = require("../model/monitoring");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");
const { TIME_ZONE } = require("../utils/constants");

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 92;
const BLOCK_COLS = 5;
const BLOCK_GAP_COLS = 1;
const BLOCKS_PER_ROW = 3;
const SOURCE_LABELS = { booking: "Bookings (Online)", walkin: "Room Monitoring (Walk-in)", all: "All Sales" };

router.use(requirePermission(PERMISSIONS.REPORTS_VIEW));

function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function formatTime(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(date);
}

function formatDuration(hours) {
  const totalSeconds = Math.round((Number(hours) || 0) * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function blockLabel(session) {
  const parts = [session.facilityName, `${session.roomName} ${session.roomNumber}`.trim()].filter(Boolean);
  return parts.join(" — ");
}

function groupSessions(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const key = `${session.facilityName}||${session.roomName}||${session.roomNumber}`;
    if (!groups.has(key)) {
      groups.set(key, { label: blockLabel(session), sessions: [] });
    }
    groups.get(key).sessions.push(session);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function writeBlock(sheet, group, startRow, startCol) {
  const headerRow = sheet.getRow(startRow);
  const labelCell = headerRow.getCell(startCol);
  sheet.mergeCells(startRow, startCol, startRow, startCol + 1);
  labelCell.value = group.label;
  labelCell.font = { bold: true };
  labelCell.alignment = { horizontal: "center" };

  const totalSales = group.sessions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const totalCell = headerRow.getCell(startCol + 2);
  totalCell.value = totalSales;
  totalCell.font = { bold: true };
  totalCell.numFmt = "#,##0.00";

  const subHeaderRow = sheet.getRow(startRow + 1);
  const columnTitles = ["Time In", "Time Out", "No. of Hrs", "Guest Name", "Source"];
  columnTitles.forEach((title, i) => {
    const cell = subHeaderRow.getCell(startCol + i);
    cell.value = title;
    cell.font = { bold: true };
  });

  group.sessions.forEach((session, i) => {
    const row = sheet.getRow(startRow + 2 + i);
    row.getCell(startCol).value = formatTime(session.startTime);
    row.getCell(startCol + 1).value = formatTime(session.endedAt);
    row.getCell(startCol + 2).value = formatDuration(session.duration);
    row.getCell(startCol + 3).value = session.guestName || "";
    row.getCell(startCol + 4).value = session.booking ? "Booking" : "Walk-in";
  });

  for (let c = 0; c < BLOCK_COLS; c++) {
    sheet.getColumn(startCol + c).width = 13;
  }

  return group.sessions.length;
}

function writeDaySheet(sheet, groups, sourceLabel) {
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = sourceLabel;
  titleCell.font = { bold: true, size: 13 };

  let row = 3;
  for (let i = 0; i < groups.length; i += BLOCKS_PER_ROW) {
    const rowGroups = groups.slice(i, i + BLOCKS_PER_ROW);
    let maxRows = 0;
    rowGroups.forEach((group, j) => {
      const startCol = 1 + j * (BLOCK_COLS + BLOCK_GAP_COLS);
      const dataRows = writeBlock(sheet, group, row, startCol);
      maxRows = Math.max(maxRows, dataRows);
    });
    row += 2 + maxRows + 2;
  }

  if (!groups.length) {
    sheet.getCell(row, 1).value = "No sales recorded for this day.";
  }
}

router.get("/export", async (req, res) => {
  try {
    const from = parseDateKey(req.query.from);
    const to = parseDateKey(req.query.to);
    const source = ["booking", "walkin", "all"].includes(req.query.source) ? req.query.source : "all";

    if (!from || !to) {
      return res.status(400).json({ message: "from and to must be valid dates (YYYY-MM-DD)." });
    }
    if (from > to) {
      return res.status(400).json({ message: "from must not be after to." });
    }
    const rangeDays = Math.round((to - from) / DAY_MS) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      return res.status(400).json({ message: `Date range cannot exceed ${MAX_RANGE_DAYS} days.` });
    }

    const rangeStart = from;
    const rangeEnd = new Date(to.getTime() + DAY_MS);

    const filter = {
      status: "Finished",
      startTime: { $gte: rangeStart, $lt: rangeEnd },
    };
    if (source === "booking") filter.booking = { $ne: null };
    if (source === "walkin") filter.booking = null;

    const sessions = await RoomSession.find(filter).sort({ startTime: 1 });

    const byDay = new Map();
    for (const session of sessions) {
      const key = toDateKey(session.startTime);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(session);
    }

    const workbook = new ExcelJS.Workbook();
    const sourceLabel = SOURCE_LABELS[source];

    for (let d = new Date(rangeStart); d <= to; d = new Date(d.getTime() + DAY_MS)) {
      const key = toDateKey(d);
      const sheet = workbook.addWorksheet(key);
      const groups = groupSessions(byDay.get(key) || []);
      writeDaySheet(sheet, groups, sourceLabel);
    }

    const sourceTag = { booking: "Bookings", walkin: "RoomMonitoring", all: "All" }[source];
    const filename = `Riverview-${sourceTag}-Report_${toDateKey(from)}_to_${toDateKey(to)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to generate report." });
  }
});

module.exports = router;