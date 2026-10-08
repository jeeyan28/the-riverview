const ss = require("simple-statistics");
const { addDays, validDateKey } = require("./businessDate");
const { TIME_ZONE } = require("./constants");

const VALID_WINDOWS = [7, 14, 30];
const DEFAULT_WINDOW = 7;
const FORECAST_RANGES = Object.freeze({
  daily: { label: "Daily", forecastLabel: "next 14 days", historyDays: 60, forecastDays: 14 },
  weekly: { label: "Weekly", forecastLabel: "next 8 weeks", historyDays: 180, forecastDays: 56 },
  monthly: { label: "Monthly", forecastLabel: "next 6 months", historyDays: 365, forecastDays: 180 },
});
const DEFAULT_RANGE = "daily";
const EXCLUDED_BOOKING_STATUSES = new Set(["Cancelled", "Rejected", "No Show"]);

const HEURISTIC_BAND_MULTIPLIER = 1.28;
const ANOMALY_STDDEV_THRESHOLD = 2;

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

function rollingSMA(series, window) {
  return series.map((_, i) => {
    if (i < window - 1) return null;
    const slice = series.slice(i - window + 1, i + 1);
    return ss.mean(slice);
  });
}

function residualStdDev(series, sma) {
  const residuals = [];
  for (let i = 0; i < series.length; i++) {
    if (sma[i] === null) continue;
    residuals.push(series[i] - sma[i]);
  }
  if (residuals.length < 2) return 0;
  return ss.standardDeviation(residuals);
}

function trendAdjustedProjection(series, window, days) {
  const lookback = Math.min(series.length, window * 2);
  const recentSeries = series.slice(-lookback);
  const points = recentSeries.map((v, i) => [i, v]);

  let slope;
  try {
    const model = ss.linearRegression(points);
    slope = Number.isFinite(model.m) ? model.m : 0;
  } catch {
    slope = 0;
  }

  const base = movingAverage(series, window);
  const sma = rollingSMA(series, window);
  const volatility = residualStdDev(series, sma);
  const band = volatility * HEURISTIC_BAND_MULTIPLIER;

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

function buildInsights({ trend, seasonality, volatility, anomalies, topRooms, window, forecastLabel }) {
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
    text: `Revenue volatility is ${volatility.level} (±₱${Math.round(volatility.revenueStdDev).toLocaleString()} per day), giving the ${forecastLabel} forecast a heuristic variability range. Its probability coverage has not been measured.`,
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

function buildForecastBriefing({ trend, seasonality, volatility, anomalies, topRooms, projection, window, historyDays, forecastLabel }) {
  const projectedRevenue = projection.reduce((sum, day) => sum + day.projectedRevenue, 0);
  const projectedBookings = Math.round(projection.reduce((sum, day) => sum + day.projectedBookings, 0));
  const directionText = trend.revenueDirection === "flat"
    ? "is holding steady"
    : `is trending ${trend.revenueDirection} by ${Math.abs(trend.revenuePercent)}%`;

  const actions = [];
  if (seasonality.revenue.best) {
    actions.push(`Plan staffing and room readiness around ${seasonality.revenue.best.day}, the strongest recent revenue day.`);
  }
  if (seasonality.revenue.worst && seasonality.revenue.worst.day !== seasonality.revenue.best?.day) {
    actions.push(`Consider a targeted offer for ${seasonality.revenue.worst.day}, the weakest recent revenue day.`);
  }
  if (topRooms[0]) {
    actions.push(`Protect availability and maintenance time for ${topRooms[0].roomLabel}, the most requested service in the history window.`);
  }
  if (!actions.length) actions.push("Keep recording completed sessions and payments so the next forecast has a stronger history base.");

  const risks = [];
  if (volatility.level !== "low") {
    risks.push(`Daily revenue variability is ${volatility.level}; use the heuristic range cautiously when planning cash and staffing.`);
  }
  if (anomalies.length) {
    risks.push(`${anomalies.length} recent unusual result${anomalies.length === 1 ? " was" : "s were"} detected and should be checked against closures, events, or data-entry corrections.`);
  }
  if (!projectedRevenue && !projectedBookings) {
    risks.push("The selected history window has no collected revenue or eligible reservation activity, so projections remain at zero.");
  }

  return {
    summary: `Using the last ${historyDays} days and a ${window}-day moving average, revenue ${directionText}. The ${forecastLabel} project about ₱${Math.round(projectedRevenue).toLocaleString()} from ${projectedBookings} reservation${projectedBookings === 1 ? "" : "s"}.`,
    actions: actions.slice(0, 3),
    risks: risks.slice(0, 3),
    method: "Trend-adjusted moving average; weekday patterns and anomalies are descriptive. The shaded range is heuristic, with no measured probability coverage.",
  };
}


const MODEL_VERSION = "sma-trend-v1";
const MAX_HISTORY_DAYS = 365;
const MAX_EVALUATION_FOLDS = 24;
const MIN_EVALUATION_FOLDS = 6;
const MODEL_OPTIONS = Object.freeze([
  { id: "sma-trend", label: "Trend-adjusted moving average", version: MODEL_VERSION },
  { id: "last-observation", label: "Last observation", version: "naive-v1" },
  { id: "same-weekday", label: "Same-weekday seasonal naive", version: "seasonal-naive-7-v1" },
]);

function lastObservationProjection(series, horizon) {
  return Array.from({ length: horizon }, () => series.at(-1) ?? 0);
}

function seasonalNaiveProjection(series, horizon) {
  const week = series.slice(-7);
  return Array.from({ length: horizon }, (_, index) => week[index % week.length] ?? 0);
}

function errorMetrics(predictions, actual) {
  if (!actual.length) return { mae: null, rmse: null, sampleCount: 0 };
  let absoluteError = 0;
  let squaredError = 0;
  for (let index = 0; index < actual.length; index++) {
    const error = predictions[index] - actual[index];
    absoluteError += Math.abs(error);
    squaredError += error * error;
  }
  return { mae: absoluteError / actual.length, rmse: Math.sqrt(squaredError / actual.length), sampleCount: actual.length };
}

function evaluateForecast({ history = [], window = DEFAULT_WINDOW, horizon = 14, recordedFrom, completeThrough, evaluatedAt = null, synthetic = false } = {}) {
  if (!Number.isInteger(window) || window < 1 || window > 30) throw new RangeError("Choose a forecast window from 1 to 30 days.");
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 180) throw new RangeError("Choose a forecast horizon from 1 to 180 days.");
  if (!Array.isArray(history)) throw new TypeError("Forecast history must be an array.");
  const bounded = history.slice(-MAX_HISTORY_DAYS);
  const firstRecordedDate = recordedFrom === undefined ? bounded[0]?.date : recordedFrom;
  const observed = validDateKey(firstRecordedDate)
    ? bounded.filter((day) => day.date >= firstRecordedDate && (!completeThrough || day.date <= completeThrough))
    : [];
  const minimumTrainingDays = Math.max(28, window * 2);
  const eligibleFoldCount = Math.max(0, observed.length - minimumTrainingDays - horizon + 1);
  const result = {
    status: "insufficient_history",
    reason: null,
    method: "Rolling origin; identical training prefixes and full daily horizons for every compared model.",
    modelId: "sma-trend",
    modelVersion: MODEL_VERSION,
    window,
    horizonDays: horizon,
    evaluatedAt,
    timeZone: TIME_ZONE,
    synthetic: Boolean(synthetic),
    historyDays: observed.length,
    minimumTrainingDays,
    minimumFolds: MIN_EVALUATION_FOLDS,
    maximumFolds: MAX_EVALUATION_FOLDS,
    eligibleFoldCount,
    foldCount: 0,
    sampleCount: 0,
    period: { from: observed[0]?.date || null, to: observed.at(-1)?.date || null },
    evaluationPeriod: { from: null, to: null },
    folds: [],
    targets: {},
    definitions: {
      revenue: "Recorded net collected revenue after refunds, attributed to service date by the sales ledger.",
      bookings: "Ledger reservations excluding Cancelled, Rejected and No Show; not a completed-session count.",
      zeroDays: "Complete dates without ledger activity, including past closures, are retained as zero after the first recorded date.",
      missingDates: "Missing, duplicate, invalid or nonnumeric observations prevent evaluation.",
      outliers: "Recorded outliers are retained; RMSE gives large errors greater weight.",
      closures: "Future closures are not inferred by these models; estimates do not guarantee the venue is open.",
      revisions: "Retrospective evaluation uses current service-date ledger totals; historical payment/refund revisions are not reconstructed.",
      scoring: "MAE and RMSE cover every day of each full horizon; folds may overlap. No percentage metric is used.",
    },
  };
  const validHistory = observed.every((day, index) => validDateKey(day.date)
    && Number.isFinite(day.revenue) && day.revenue >= 0
    && Number.isFinite(day.bookingCount) && day.bookingCount >= 0
    && (!index || day.date === addDays(observed[index - 1].date, 1)));
  if (!validHistory || (completeThrough && !validDateKey(completeThrough))) {
    result.reason = "History contains missing, invalid or duplicate daily observations.";
    return result;
  }
  if (eligibleFoldCount < MIN_EVALUATION_FOLDS) {
    result.reason = "Insufficient history: this horizon needs at least " + (minimumTrainingDays + horizon + MIN_EVALUATION_FOLDS - 1) + " complete recorded business days and " + MIN_EVALUATION_FOLDS + " evaluation folds.";
    return result;
  }
  const foldCount = Math.min(MAX_EVALUATION_FOLDS, eligibleFoldCount);
  const origins = Array.from({ length: foldCount }, (_, index) => minimumTrainingDays + Math.floor(index * (eligibleFoldCount - 1) / (foldCount - 1)));
  result.folds = origins.map((origin) => ({
    origin: observed[origin - 1].date,
    trainingFrom: observed[0].date,
    trainingTo: observed[origin - 1].date,
    trainingDays: origin,
    testingFrom: observed[origin].date,
    testingTo: observed[origin + horizon - 1].date,
  }));
  result.status = "sufficient";
  result.foldCount = foldCount;
  result.sampleCount = foldCount * horizon;
  result.evaluationPeriod = { from: result.folds[0].testingFrom, to: result.folds.at(-1).testingTo };
  for (const [target, field] of [["revenue", "revenue"], ["bookings", "bookingCount"]]) {
    const models = MODEL_OPTIONS.map((model) => ({ ...model, predicted: [], actual: [], endPredicted: [], endActual: [] }));
    for (const origin of origins) {
      const training = observed.slice(0, origin).map((day) => day[field]);
      const actual = observed.slice(origin, origin + horizon).map((day) => day[field]);
      const forecasts = [
        trendAdjustedProjection(training, window, horizon).values.map((day) => day.value),
        lastObservationProjection(training, horizon),
        seasonalNaiveProjection(training, horizon),
      ];
      models.forEach((model, index) => {
        model.predicted.push(...forecasts[index]);
        model.actual.push(...actual);
        model.endPredicted.push(forecasts[index].at(-1));
        model.endActual.push(actual.at(-1));
      });
    }
    const scores = models.map(({ predicted, actual, endPredicted, endActual, ...model }) => ({
      ...model,
      ...errorMetrics(predicted, actual),
      horizonEnd: errorMetrics(endPredicted, endActual),
    }));
    const best = [...scores].sort((a, b) => a.mae - b.mae || a.rmse - b.rmse)[0];
    result.targets[target] = {
      unit: target === "revenue" ? "PHP per business day" : "reservations per business day",
      models: scores,
      recommendedModelId: best.id,
      baselineBeatsCurrent: best.id !== "sma-trend",
    };
  }
  return result;
}

function buildForecastResponse({ sales, todayKey, window = DEFAULT_WINDOW, forecastRange = DEFAULT_RANGE, evaluatedAt = null }) {
  const rangeConfig = FORECAST_RANGES[forecastRange];
  const sinceKey = addDays(todayKey, -(rangeConfig.historyDays - 1));
  const byDay = new Map();
  for (let index = 0; index < rangeConfig.historyDays; index++) byDay.set(addDays(sinceKey, index), { revenue: 0, bookingCount: 0 });
  for (const day of sales.daily) {
    if (byDay.has(day.date)) byDay.set(day.date, { revenue: day.collected, bookingCount: 0 });
  }
  const roomDemand = new Map();
  let recordedFrom = null;
  for (const row of sales.rows) {
    const bucket = byDay.get(row.date);
    if (!bucket) continue;
    if (!recordedFrom || row.date < recordedFrom) recordedFrom = row.date;
    const operational = row.bookingId && !EXCLUDED_BOOKING_STATUSES.has(row.status);
    if (operational) {
      bucket.bookingCount += 1;
      roomDemand.set(row.facilityName, (roomDemand.get(row.facilityName) || 0) + 1);
    }
  }
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const revenueSeries = days.map(([, v]) => v.revenue);
  const bookingSeries = days.map(([, v]) => v.bookingCount);

  const revenueSMA = rollingSMA(revenueSeries, window);
  const bookingSMA = rollingSMA(bookingSeries, window);

  const revenueForecast = trendAdjustedProjection(revenueSeries, window, rangeConfig.forecastDays);
  const bookingForecast = trendAdjustedProjection(bookingSeries, window, rangeConfig.forecastDays);

  const projection = [];
  for (let i = 0; i < rangeConfig.forecastDays; i++) {
    const date = addDays(todayKey, i + 1);
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
    forecastLabel: rangeConfig.forecastLabel,
  });

  const briefing = buildForecastBriefing({
    trend,
    seasonality: { revenue: revenueSeasonality, booking: bookingSeasonality },
    volatility,
    anomalies,
    topRooms,
    projection,
    window,
    historyDays: rangeConfig.historyDays,
    forecastLabel: rangeConfig.forecastLabel,
  });


  const evaluation = evaluateForecast({
    history: days.map(([date, values]) => ({ date, ...values })),
    window,
    horizon: rangeConfig.forecastDays,
    recordedFrom,
    completeThrough: addDays(todayKey, -1),
    evaluatedAt,
    synthetic: sales.synthetic,
  });
  if (evaluation.status !== "sufficient") briefing.risks = [evaluation.reason, ...briefing.risks].slice(0, 3);
  return {
    window,
    validWindows: VALID_WINDOWS,
    forecastRange,
    validRanges: Object.entries(FORECAST_RANGES).map(([value, config]) => ({
      value,
      label: config.label,
      forecastLabel: config.forecastLabel,
    })),
    historyDays: rangeConfig.historyDays,
    forecastDays: rangeConfig.forecastDays,
    forecastLabel: rangeConfig.forecastLabel,
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
    briefing,
    evaluation,
    model: { id: "sma-trend", version: MODEL_VERSION, label: "Trend-adjusted moving average" },
    rangeLabel: "Heuristic variability range",
    rangeExplanation: "The band is based on historical variability. Its probability coverage has not been measured.",
    estimatesOnly: true,
    timeZone: TIME_ZONE,
    basis: sales.range?.basis || "service date",
    synthetic: Boolean(sales.synthetic),
  };
}

module.exports = {
  VALID_WINDOWS, DEFAULT_WINDOW, FORECAST_RANGES, DEFAULT_RANGE, MODEL_VERSION,
  movingAverage, rollingSMA, trendAdjustedProjection,
  lastObservationProjection, seasonalNaiveProjection, errorMetrics,
  evaluateForecast, buildForecastResponse,
};
