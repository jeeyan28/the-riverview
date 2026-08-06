const express = require("express");
const router = express.Router();

const Booking = require("../model/booking");
const { RoomSession } = require("../model/monitoring");
const { ensureAdmin } = require("../middleware/adminAuth");
const { TIME_ZONE } = require("../utils/constants");

const TREND_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

router.use(ensureAdmin);

router.get("/summary", async (req, res) => {
  try {
    const now = new Date();
    const todayKey = dateKey(now);
    const yesterdayKey = dateKey(new Date(now.getTime() - DAY_MS));
    const since = new Date(now.getTime() - TREND_WINDOW_DAYS * DAY_MS);

    const [todayBookingsCount, yesterdayBookingsCount, activeSessions, recentBookings, recentSessions] = await Promise.all([
      Booking.countDocuments({ date: todayKey }),
      Booking.countDocuments({ date: yesterdayKey }),
      RoomSession.find({ status: "Active" }).select("facilityName startTime duration"),
      Booking.find({
        createdAt: { $gte: since },
        status: { $nin: [Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.CANCELLED] },
      }).select("createdAt amount"),
      RoomSession.find({ startTime: { $gte: since } }).select("startTime amount"),
    ]);

    const overdueCount = activeSessions.filter(
      (s) => s.startTime.getTime() + s.duration * 3600000 <= now.getTime()
    ).length;

    const byFacility = new Map();
    for (const s of activeSessions) {
      const label = s.facilityName || "Other";
      byFacility.set(label, (byFacility.get(label) || 0) + 1);
    }
    const activeByFacility = Array.from(byFacility.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([facilityName, count]) => ({ facilityName, count }));

    const revenueByDay = new Map();
    for (let i = 0; i <= TREND_WINDOW_DAYS; i++) {
      revenueByDay.set(dateKey(new Date(since.getTime() + i * DAY_MS)), 0);
    }
    for (const b of recentBookings) {
      const key = dateKey(new Date(b.createdAt));
      if (revenueByDay.has(key)) revenueByDay.set(key, revenueByDay.get(key) + (b.amount || 0));
    }
    for (const s of recentSessions) {
      const key = dateKey(new Date(s.startTime));
      if (revenueByDay.has(key)) revenueByDay.set(key, revenueByDay.get(key) + (s.amount || 0));
    }

    const todayRevenue = revenueByDay.get(todayKey) || 0;
    const priorDays = Array.from(revenueByDay.entries()).filter(([key]) => key !== todayKey);
    const avgPriorRevenue = priorDays.length
      ? priorDays.reduce((sum, [, v]) => sum + v, 0) / priorDays.length
      : 0;

    let revenueDirection = "flat";
    let revenuePercentVsAvg = 0;
    if (avgPriorRevenue > 0) {
      revenuePercentVsAvg = Math.round(((todayRevenue - avgPriorRevenue) / avgPriorRevenue) * 100);
      revenueDirection = todayRevenue > avgPriorRevenue ? "up" : todayRevenue < avgPriorRevenue ? "down" : "flat";
    } else if (todayRevenue > 0) {
      revenueDirection = "up";
    }

    res.json({
      todayBookings: {
        count: todayBookingsCount,
        deltaVsYesterday: todayBookingsCount - yesterdayBookingsCount,
      },
      activeSessions: {
        count: activeSessions.length,
        byFacility: activeByFacility,
      },
      todayRevenue: {
        amount: todayRevenue,
        percentVsAvg: revenuePercentVsAvg,
        direction: revenueDirection,
      },
      overdueRooms: {
        count: overdueCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;