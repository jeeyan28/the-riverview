const express = require('express');
const { requirePermission } = require('../middleware/adminAuth');
const { PERMISSIONS } = require('../utils/permissions');
const { getSalesReport } = require('../utils/salesReport');
const { createWorkbook, addSummarySheet, addActivitySheet, addRoomTypeSheet, styleHeading } = require('../utils/reportWorkbook');

const router = express.Router();
router.use(requirePermission(PERMISSIONS.REPORTS_VIEW));

function queryRange(req) {
  return { from: req.query.from, to: req.query.to, source: req.query.source || 'all' };
}

router.get('/', async (req, res) => {
  try {
    res.json(await getSalesReport(queryRange(req)));
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.status === 400 ? err.message : 'Could not load the sales report.' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const report = await getSalesReport(queryRange(req));
    const workbook = createWorkbook();
    addSummarySheet(workbook, {
      title: 'The Riverview — Sales report',
      range: report.range,
      metrics: [
        { label: 'Transactions', value: report.summary.transactions },
        { label: 'Played / booked hours', value: report.summary.bookedHours, format: 'hours' },
        { label: 'Charges', value: report.summary.charged, format: 'money' },
        { label: 'Collected, net of refunds', value: report.summary.collected, format: 'money' },
        { label: 'Outstanding balance', value: report.summary.outstanding, format: 'money' },
        { label: 'Recorded refunds', value: report.summary.refunded, format: 'money' },
      ],
      notes: ['One reservation linked to a played session appears once.', ...report.warnings],
    });
    addActivitySheet(workbook, report.rows, { name: 'Transactions', includeReview: true });
    addRoomTypeSheet(workbook, report.byFacility);

    const daily = workbook.addWorksheet('Daily totals');
    daily.columns = [
      { header: 'Service date', key: 'date', width: 16 }, { header: 'Charges', key: 'charged', width: 18 },
      { header: 'Collected', key: 'collected', width: 18 }, { header: 'Outstanding', key: 'outstanding', width: 18 },
      { header: 'Transactions', key: 'transactions', width: 16 },
    ];
    daily.addRows(report.daily);
    styleHeading(daily.getRow(1));
    for (const key of ['charged', 'collected', 'outstanding']) daily.getColumn(key).numFmt = '"₱"#,##0.00';

    const filename = `Riverview-Sales_${report.range.from}_to_${report.range.to}_${report.range.source}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(err.status || 500).json({ message: err.status === 400 ? err.message : 'Could not generate the report.' });
  }
});

module.exports = router;
