const express = require('express');
const router = express.Router();
const Booking = require('../model/booking');
const { RoomSession } = require('../model/monitoring');
const { requirePermission } = require('../middleware/adminAuth');
const { PERMISSIONS } = require('../utils/permissions');
const { businessDate, addDays } = require('../utils/businessDate');
const { getSalesReport } = require('../utils/salesReport');

const TREND_WINDOW_DAYS = 7;

router.use(requirePermission(PERMISSIONS.REPORTS_VIEW));

router.get('/summary', async (req, res) => {
  try {
    const todayKey = businessDate();
    const yesterdayKey = addDays(todayKey, -1);
    const sinceKey = addDays(todayKey, -TREND_WINDOW_DAYS);
    const [todayBookings, yesterdayBookings, activeSessions, sales, pendingReservations, cancellationRequests] = await Promise.all([
      Booking.countDocuments({ date: todayKey, status: { $nin: ['Rejected', 'Cancelled', 'No Show'] } }),
      Booking.countDocuments({ date: yesterdayKey, status: { $nin: ['Rejected', 'Cancelled', 'No Show'] } }),
      RoomSession.find({ status: 'Active' }).select('facilityName startTime duration').lean(),
      getSalesReport({ from: sinceKey, to: todayKey }),
      Booking.countDocuments({ status: { $in: ['Pending', 'Pending Payment Verification', 'Awaiting Online Payment'] } }),
      Booking.countDocuments({ cancellationStatus: 'Requested' }),
    ]);

    const activeByFacility = new Map();
    let overdueCount = 0;
    const now = Date.now();
    for (const session of activeSessions) {
      const label = session.facilityName || 'Other';
      activeByFacility.set(label, (activeByFacility.get(label) || 0) + 1);
      if (new Date(session.startTime).getTime() + Number(session.duration || 0) * 3600000 <= now) overdueCount += 1;
    }
    const today = sales.daily.find((day) => day.date === todayKey) || { charged: 0, collected: 0, outstanding: 0 };
    const priorDays = sales.daily.filter((day) => day.date !== todayKey);
    const avgPriorCollected = priorDays.length ? priorDays.reduce((sum, day) => sum + day.collected, 0) / priorDays.length : 0;
    const revenuePercentVsAvg = avgPriorCollected ? Math.round(((today.collected - avgPriorCollected) / avgPriorCollected) * 100) : 0;

    res.json({
      todayBookings: { count: todayBookings, deltaVsYesterday: todayBookings - yesterdayBookings },
      activeSessions: { count: activeSessions.length, byFacility: [...activeByFacility.entries()].sort((a, b) => b[1] - a[1]).map(([facilityName, count]) => ({ facilityName, count })) },
      todayRevenue: { amount: today.collected, percentVsAvg: revenuePercentVsAvg, direction: revenuePercentVsAvg > 0 ? 'up' : revenuePercentVsAvg < 0 ? 'down' : 'flat' },
      overdueRooms: { count: overdueCount },
      financial: { charged: today.charged, collected: today.collected, outstanding: today.outstanding, refunded: sales.rows.filter((row) => row.date === todayKey).reduce((sum, row) => sum + row.refundedAmount, 0) },
      pendingReservations,
      cancellationRequests,
      unpaidSessions: sales.rows.filter((row) => row.date === todayKey && row.sessionId && row.balance > 0).length,
      revenueBasis: 'Recorded payments, net of refunds, by service date in Asia/Manila.',
      warnings: sales.warnings,
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.status === 400 ? err.message : 'Server error.' });
  }
});

module.exports = router;
