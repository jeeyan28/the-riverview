const express = require("express");
const router = express.Router();

const Booking = require("../model/booking");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

router.use(requirePermission(PERMISSIONS.FORECASTING_VIEW));

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;
const FORECAST_DAYS = 14;

function toDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function linearRegression(points) {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const [x, y] of points) {
    sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);

    const bookings = await Booking.find({
      createdAt: { $gte: since },
      status: { $nin: [Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.CANCELLED] },
    }).select("createdAt amount roomLabel status");

    const byDay = new Map();
    for (let i = 0; i <= HISTORY_DAYS; i++) {
      const key = toDateKey(new Date(since.getTime() + i * DAY_MS));
      byDay.set(key, { revenue: 0, bookingCount: 0 });
    }
    const roomDemand = new Map();

    for (const b of bookings) {
      const key = toDateKey(new Date(b.createdAt));
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.revenue += b.amount || 0;
        bucket.bookingCount += 1;
      }
      roomDemand.set(b.roomLabel, (roomDemand.get(b.roomLabel) || 0) + 1);
    }

    const days = Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));

    const revenuePoints = days.map(([, v], idx) => [idx, v.revenue]);
    const bookingPoints = days.map(([, v], idx) => [idx, v.bookingCount]);

    const revenueTrend = linearRegression(revenuePoints);
    const bookingTrend = linearRegression(bookingPoints);

    const lastIndex = days.length - 1;
    const projection = [];
    for (let i = 1; i <= FORECAST_DAYS; i++) {
      const x = lastIndex + i;
      const date = toDateKey(new Date(now.getTime() + i * DAY_MS));
      projection.push({
        date,
        projectedRevenue: Math.max(0, Math.round(revenueTrend.slope * x + revenueTrend.intercept)),
        projectedBookings: Math.max(0, Math.round(bookingTrend.slope * x + bookingTrend.intercept)),
      });
    }

    const topRooms = Array.from(roomDemand.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([roomLabel, count]) => ({ roomLabel, count }));

    res.json({
      history: days.map(([date, v]) => ({ date, revenue: v.revenue, bookingCount: v.bookingCount })),
      projection,
      topRooms,
      trend: {
        revenueDirection: revenueTrend.slope > 0 ? "up" : revenueTrend.slope < 0 ? "down" : "flat",
        bookingDirection: bookingTrend.slope > 0 ? "up" : bookingTrend.slope < 0 ? "down" : "flat",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;