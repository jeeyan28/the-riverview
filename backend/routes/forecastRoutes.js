const express = require("express");
const router = express.Router();
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");
const { businessDate, addDays } = require("../utils/businessDate");
const { getSalesReport } = require("../utils/salesReport");
const { VALID_WINDOWS, DEFAULT_WINDOW, FORECAST_RANGES, DEFAULT_RANGE, buildForecastResponse } = require("../utils/forecastEvaluation");

router.use(requirePermission(PERMISSIONS.FORECASTING_VIEW));

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = VALID_WINDOWS.length * Object.keys(FORECAST_RANGES).length;
const forecastCache = new Map();

router.get("/", async (req, res) => {
  const window = VALID_WINDOWS.includes(Number(req.query.window)) ? Number(req.query.window) : DEFAULT_WINDOW;
  const forecastRange = Object.hasOwn(FORECAST_RANGES, req.query.range) ? req.query.range : DEFAULT_RANGE;
  const rangeConfig = FORECAST_RANGES[forecastRange];
  const now = new Date();
  const todayKey = businessDate(now);
  const key = [todayKey, window, forecastRange].join("|");
  let entry = forecastCache.get(key);
  try {
    if (!entry || entry.expiresAt <= now.getTime()) {
      for (const [cachedKey, cached] of forecastCache) {
        if (cached.expiresAt <= now.getTime()) forecastCache.delete(cachedKey);
      }
      while (forecastCache.size >= MAX_CACHE_ENTRIES) forecastCache.delete(forecastCache.keys().next().value);
      const promise = getSalesReport({
        from: addDays(todayKey, -(rangeConfig.historyDays - 1)),
        to: todayKey,
        maxDays: rangeConfig.historyDays,
      }).then((sales) => buildForecastResponse({ sales, todayKey, window, forecastRange, evaluatedAt: now.toISOString() }));
      entry = { promise, expiresAt: now.getTime() + CACHE_TTL_MS };
      forecastCache.set(key, entry);
    }
    res.json(await entry.promise);
  } catch (err) {
    if (forecastCache.get(key) === entry) forecastCache.delete(key);
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
