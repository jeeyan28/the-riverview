const express = require("express");
const router = express.Router();
const ss = require("simple-statistics");

const Booking = require("../model/booking");
const { RoomSession } = require("../model/monitoring");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");
const { generateForecastNarrative } = require("../utils/aiForecastNarrative");

router.use(requirePermission(PERMISSIONS.FORECASTING_VIEW));

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;
const FORECAST_DAYS = 14;
const VALID_WINDOWS = [7, 14, 30];
const DEFAULT_WINDOW = 7;

// 80% confidence interval z-score. A lightweight, defensible band for a
// business dashboard without overstating precision (95% would imply more
// certainty than a pure SMA+trend model actually has).
const CONFIDENCE_Z = 1.28;
// A day is flagged as an anomaly (spike/drop) when it deviates from its
// rolling SMA by more than this many standard deviations.
const ANOMALY_STDDEV_THRESHOLD = 2;

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// In-memory cache for AI-generated narratives, keyed by `${window}:${dateKey}`.
// The underlying data only moves forward one day at a time, so re-generating
// the narrative on every dashboard refresh would just burn API calls for an
// identical answer. Process-local (not Redis/DB) is an acceptable tradeoff
// here: worst case after a redeploy is one extra AI call per window.
const AI_NARRATIVE_CACHE = new Map();
const AI_NARRATIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
// If the AI call fails (rate limit, provider overloaded, etc.), also cache
// the *failure* for a short cooldown. Without this, every forecast request
// during an outage/rate-limit window re-attempts the AI call — which is
// exactly what can turn a single transient error into a burst that exhausts
// a free-tier quota (observed with Gemini's free tier during development).
const AI_NARRATIVE_FAILURE_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
const AI_NARRATIVE_FAILURE_AT = new Map();

async function getCachedNarrative(cacheKey, context) {
  const cached = AI_NARRATIVE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const lastFailure = AI_NARRATIVE_FAILURE_AT.get(cacheKey);
  if (lastFailure && Date.now() - lastFailure < AI_NARRATIVE_FAILURE_COOLDOWN_MS) return null;

  const value = await generateForecastNarrative(context);
  if (value) {
    AI_NARRATIVE_CACHE.set(cacheKey, { value, expiresAt: Date.now() + AI_NARRATIVE_CACHE_TTL_MS });
    AI_NARRATIVE_FAILURE_AT.delete(cacheKey);
  } else {
    AI_NARRATIVE_FAILURE_AT.set(cacheKey, Date.now());
  }
  return value;
}

function toDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
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

// Rolling SMA aligned to the series — first (window - 1) entries are null
// since there isn't enough history yet to average over.
function rollingSMA(series, window) {
  return series.map((_, i) => {
    if (i < window - 1) return null;
    const slice = series.slice(i - window + 1, i + 1);
    return ss.mean(slice);
  });
}

// Residual volatility: how far actual values typically stray from their own
// rolling SMA. Used to size the confidence band around the forecast.
function residualStdDev(series, sma) {
  const residuals = [];
  for (let i = 0; i < series.length; i++) {
    if (sma[i] === null) continue;
    residuals.push(series[i] - sma[i]);
  }
  if (residuals.length < 2) return 0;
  return ss.standardDeviation(residuals);
}

// Trend-adjusted projection: instead of repeating a single flat SMA value
// for all 14 forecast days, fit a linear regression over the most recent
// `window * 2` days (or all available history if shorter) and extend that
// line forward. The SMA anchors the starting level; the slope carries the
// trend. This is still an SMA-based model (no external ML dependency) but
// behaves far closer to what a professional forecast should look like.
function trendAdjustedProjection(series, window, days) {
  const lookback = Math.min(series.length, window * 2);
  const recentSeries = series.slice(-lookback);
  const points = recentSeries.map((v, i) => [i, v]);

  let slope = 0;
  try {
    const model = ss.linearRegression(points);
    slope = Number.isFinite(model.m) ? model.m : 0;
  } catch {
    slope = 0;
  }

  const base = movingAverage(series, window);
  const sma = rollingSMA(series, window);
  const volatility = residualStdDev(series, sma);
  const band = volatility * CONFIDENCE_Z;

  const values = [];
  for (let i = 1; i <= days; i++) {
    const projected = Math.max(0, base + slope * i);
    values.push({
      value: Math.round(projected),
      low: Math.max(0, Math.round(projected - band)),
      high: Math.round(projected + band),
    });
  }
  return { values, slope, volatility };
}

function classifyVolatility(stdDev, mean) {
  if (!mean) return "low";
  const ratio = stdDev / mean;
  if (ratio < 0.3) return "low";
  if (ratio < 0.6) return "moderate";
  return "high";
}

function weekdaySeasonality(days, metric) {
  const buckets = WEEKDAY_NAMES.map(() => []);
  for (const [dateKey, v] of days) {
    buckets[weekdayOf(dateKey)].push(v[metric]);
  }
  const byWeekday = buckets.map((values, i) => ({
    day: WEEKDAY_NAMES[i],
    average: values.length ? Math.round(ss.mean(values) * 10) / 10 : 0,
  }));
  const withData = byWeekday.filter((b) => b.average > 0);
  const overallAvg = withData.length ? ss.mean(withData.map((b) => b.average)) : 0;
  const best = withData.length ? withData.reduce((a, b) => (b.average > a.average ? b : a)) : null;
  const worst = withData.length ? withData.reduce((a, b) => (b.average < a.average ? b : a)) : null;
  return { byWeekday, best, worst, overallAvg: Math.round(overallAvg * 10) / 10 };
}

function detectAnomalies(days, series, sma, metric, label) {
  const stdDev = residualStdDev(series, sma);
  if (!stdDev) return [];
  const anomalies = [];
  for (let i = 0; i < days.length; i++) {
    if (sma[i] === null) continue;
    const diff = series[i] - sma[i];
    if (Math.abs(diff) > ANOMALY_STDDEV_THRESHOLD * stdDev) {
      anomalies.push({
        date: days[i][0],
        metric: label,
        type: diff > 0 ? "spike" : "drop",
        value: Math.round(series[i]),
        expected: Math.round(sma[i]),
      });
    }
  }
  return anomalies.slice(-5);
}

function buildInsights({ trend, seasonality, volatility, anomalies, topRooms, window }) {
  const insights = [];

  if (trend.revenueDirection !== "flat") {
    insights.push({
      icon: trend.revenueDirection === "up" ? "trending-up" : "trending-down",
      text: `Revenue is trending ${trend.revenueDirection} — ${trend.revenuePercent > 0 ? "+" : ""}${trend.revenuePercent}% versus the prior ${window}-day period.`,
    });
  }

  if (seasonality.revenue.best && seasonality.revenue.overallAvg > 0) {
    const liftPct = Math.round(((seasonality.revenue.best.average - seasonality.revenue.overallAvg) / seasonality.revenue.overallAvg) * 100);
    if (liftPct > 5) {
      insights.push({
        icon: "calendar-star",
        text: `${seasonality.revenue.best.day} is consistently the strongest day, averaging ${liftPct}% more revenue than a typical day.`,
      });
    }
  }

  if (seasonality.revenue.worst && seasonality.revenue.overallAvg > 0) {
    const dipPct = Math.round(((seasonality.revenue.overallAvg - seasonality.revenue.worst.average) / seasonality.revenue.overallAvg) * 100);
    if (dipPct > 15) {
      insights.push({
        icon: "calendar-off",
        text: `${seasonality.revenue.worst.day} runs ${dipPct}% below average — a candidate for a targeted promo.`,
      });
    }
  }

  insights.push({
    icon: "chart-histogram",
    text: `Revenue volatility is ${volatility.level} (±₱${Math.round(volatility.revenueStdDev).toLocaleString()} per day), giving the 14-day forecast an 80% confidence range rather than a single fixed number.`,
  });

  if (anomalies.length) {
    const latest = anomalies[anomalies.length - 1];
    insights.push({
      icon: latest.type === "spike" ? "alert-triangle" : "alert-circle",
      text: `Unusual ${latest.type} detected on ${latest.date} (${latest.metric}: ${latest.value} vs an expected ~${latest.expected}).`,
    });
  }

  if (topRooms.length) {
    insights.push({
      icon: "door",
      text: `${topRooms[0].roomLabel} is the most requested space, accounting for ${topRooms[0].count} of recent reservations.`,
    });
  }

  return insights;
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

    const revenueSMA = rollingSMA(revenueSeries, window);
    const bookingSMA = rollingSMA(bookingSeries, window);

    const revenueForecast = trendAdjustedProjection(revenueSeries, window, FORECAST_DAYS);
    const bookingForecast = trendAdjustedProjection(bookingSeries, window, FORECAST_DAYS);

    const projection = [];
    for (let i = 0; i < FORECAST_DAYS; i++) {
      const date = toDateKey(new Date(now.getTime() + (i + 1) * DAY_MS));
      projection.push({
        date,
        projectedRevenue: revenueForecast.values[i].value,
        projectedRevenueLow: revenueForecast.values[i].low,
        projectedRevenueHigh: revenueForecast.values[i].high,
        projectedBookings: bookingForecast.values[i].value,
        projectedBookingsLow: bookingForecast.values[i].low,
        projectedBookingsHigh: bookingForecast.values[i].high,
      });
    }

    const topRooms = Array.from(roomDemand.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([roomLabel, count]) => ({ roomLabel, count }));

    const revenueSeasonality = weekdaySeasonality(days, "revenue");
    const bookingSeasonality = weekdaySeasonality(days, "bookingCount");

    const revenueAnomalies = detectAnomalies(days, revenueSeries, revenueSMA, "revenue", "revenue");
    const bookingAnomalies = detectAnomalies(days, bookingSeries, bookingSMA, "bookingCount", "reservations");
    const anomalies = [...revenueAnomalies, ...bookingAnomalies].sort((a, b) => (a.date < b.date ? -1 : 1));

    const revenueMean = ss.mean(revenueSeries);
    const bookingMean = ss.mean(bookingSeries);
    const volatility = {
      revenueStdDev: Math.round(revenueForecast.volatility),
      bookingStdDev: Math.round(bookingForecast.volatility * 10) / 10,
      level: classifyVolatility(revenueForecast.volatility, revenueMean),
    };

    const trend = {
      revenueDirection: direction(revenueSeries, window),
      bookingDirection: direction(bookingSeries, window),
      revenuePercent: percentChange(revenueSeries, window),
      bookingPercent: percentChange(bookingSeries, window),
      revenueSlope: Math.round(revenueForecast.slope * 100) / 100,
      bookingSlope: Math.round(bookingForecast.slope * 100) / 100,
    };

    const insights = buildInsights({
      trend,
      seasonality: { revenue: revenueSeasonality, booking: bookingSeasonality },
      volatility,
      anomalies,
      topRooms,
      window,
    });

    // AI-assisted narrative: hand the model the exact numbers already
    // computed above (nothing else) and ask it to explain them in prose.
    // See utils/aiForecastNarrative.js for why the model never sees raw
    // booking records — only these derived, already-rounded statistics.
    const todayKey = toDateKey(now);
    const aiContext = {
      window,
      historyDays: HISTORY_DAYS,
      forecastDays: FORECAST_DAYS,
      trend,
      volatility,
      seasonality: {
        revenueBestDay: revenueSeasonality.best,
        revenueWorstDay: revenueSeasonality.worst,
      },
      anomalies,
      topRooms,
      next14DayProjectedRevenueTotal: projection.reduce((sum, p) => sum + p.projectedRevenue, 0),
      next14DayProjectedBookingsTotal: Math.round(projection.reduce((sum, p) => sum + p.projectedBookings, 0)),
    };
    const aiResult = await getCachedNarrative(`${window}:${todayKey}`, aiContext);

    res.json({
      window,
      validWindows: VALID_WINDOWS,
      history: days.map(([date, v], i) => ({
        date,
        revenue: v.revenue,
        bookingCount: v.bookingCount,
        smaRevenue: revenueSMA[i] === null ? null : Math.round(revenueSMA[i]),
        smaBookings: bookingSMA[i] === null ? null : Math.round(bookingSMA[i] * 10) / 10,
      })),
      projection,
      topRooms,
      trend,
      volatility,
      seasonality: {
        revenue: revenueSeasonality,
        booking: bookingSeasonality,
      },
      anomalies,
      insights,
      aiNarrative: aiResult
        ? { available: true, ...aiResult }
        : { available: false, summary: null, recommendations: [], risks: [] },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
