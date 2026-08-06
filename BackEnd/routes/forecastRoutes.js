const express = require("express");
const router = express.Router();

const Booking = require("../model/booking");
const { RoomSession } = require("../model/monitoring");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

router.use(requirePermission(PERMISSIONS.FORECASTING_VIEW));

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;
const FORECAST_DAYS = 14;
const VALID_WINDOWS = [7, 14, 30];
const DEFAULT_WINDOW = 7;

function toDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function movingAverage(values, window) {
  const slice = values.slice(-window);
  if (!slice.length) return 0;
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

function direction(series, window) {
  const recent = movingAverage(series, window);
  const prior = movingAverage(series.slice(0, -window), window);
  if (recent > prior) return "up";
  if (recent < prior) return "down";
  return "flat";
}

function percentChange(series, window) {
  const recent = movingAverage(series, window);
  const prior = movingAverage(series.slice(0, -window), window);
  if (!prior) return 0;
  return Math.round(((recent - prior) / prior) * 1000) / 10;
}

router.get("/", async (req, res) => {
  try {
    const window = VALID_WINDOWS.includes(Number(req.query.window)) ? Number(req.query.window) : DEFAULT_WINDOW;

    const now = new Date();
    const since = new Date(now.getTime() - (HISTORY_DAYS - 1) * DAY_MS);

    const [bookings, sessions] = await Promise.all([
      Booking.find({
        createdAt: { $gte: since },
        status: { $nin: [Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.CANCELLED] },
      }).select("createdAt amount roomLabel status"),
      RoomSession.find({ startTime: { $gte: since } }).select("startTime amount"),
    ]);

    const byDay = new Map();
    for (let i = 0; i < HISTORY_DAYS; i++) {
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

    for (const s of sessions) {
      const key = toDateKey(new Date(s.startTime));
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.revenue += s.amount || 0;
      }
    }

    const days = Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));

    const revenueSeries = days.map(([, v]) => v.revenue);
    const bookingSeries = days.map(([, v]) => v.bookingCount);

    const projectedRevenuePerDay = Math.max(0, Math.round(movingAverage(revenueSeries, window)));
    const projectedBookingsPerDay = Math.max(0, Math.round(movingAverage(bookingSeries, window)));

    const projection = [];
    for (let i = 1; i <= FORECAST_DAYS; i++) {
      const date = toDateKey(new Date(now.getTime() + i * DAY_MS));
      projection.push({
        date,
        projectedRevenue: projectedRevenuePerDay,
        projectedBookings: projectedBookingsPerDay,
      });
    }

    const topRooms = Array.from(roomDemand.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([roomLabel, count]) => ({ roomLabel, count }));

    res.json({
      window,
      validWindows: VALID_WINDOWS,
      history: days.map(([date, v]) => ({ date, revenue: v.revenue, bookingCount: v.bookingCount })),
      projection,
      topRooms,
      trend: {
        revenueDirection: direction(revenueSeries, window),
        bookingDirection: direction(bookingSeries, window),
        revenuePercent: percentChange(revenueSeries, window),
        bookingPercent: percentChange(bookingSeries, window),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;