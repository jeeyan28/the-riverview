const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateForecast, errorMetrics, trendAdjustedProjection, lastObservationProjection, seasonalNaiveProjection } = require('../../utils/forecastEvaluation');
const { addDays } = require('../../utils/businessDate');
const history = Array.from({ length: 100 }, (_, index) => ({ date: addDays('2026-01-01', index), revenue: index % 11 === 0 ? 0 : 100 + index % 7 * 30, bookingCount: index % 5 }));
test('MAE and RMSE handle zeros and a known error sample', () => {
  const metrics = errorMetrics([0, 2, 10], [0, 4, 6]);
  assert.equal(metrics.mae, 2); assert.equal(metrics.rmse, Math.sqrt(20 / 3));
  assert.deepEqual(errorMetrics([], []), { mae: null, rmse: null, sampleCount: 0 });
});
test('rolling-origin scores equal a replay using only each training prefix', () => {
  const result = evaluateForecast({ history, window: 7, horizon: 14 });
  assert.equal(result.status, 'sufficient');
  const forecasts = [series => trendAdjustedProjection(series, 7, 14).values.map(day => day.value), series => lastObservationProjection(series, 14), series => seasonalNaiveProjection(series, 14)];
  for (const [metric, field] of [['revenue', 'revenue'], ['bookings', 'bookingCount']]) {
    const actual = [], predicted = forecasts.map(() => []);
    for (const fold of result.folds) {
      assert.ok(fold.trainingTo < fold.testingFrom); assert.equal(fold.trainingTo, fold.origin);
      const training = history.filter(day => day.date <= fold.origin).map(day => day[field]);
      actual.push(...history.filter(day => day.date >= fold.testingFrom && day.date <= fold.testingTo).map(day => day[field]));
      forecasts.forEach((predict, index) => predicted[index].push(...predict(training)));
    }
    const scores = result.targets[metric].models;
    scores.forEach((score, index) => { assert.equal(score.mae, errorMetrics(predicted[index], actual).mae); assert.equal(score.rmse, errorMetrics(predicted[index], actual).rmse); });
  }
});
test('future and partial current-day observations cannot change evaluated history', () => {
  const options = { history, window: 7, horizon: 14, completeThrough: history.at(-1).date, evaluatedAt: '2026-04-12T00:00:00Z' };
  const result = evaluateForecast(options);
  const future = { date: addDays(history.at(-1).date, 1), revenue: 999999, bookingCount: 9999 };
  assert.deepEqual(evaluateForecast({ ...options, history: [...history, future] }), result);
  assert.deepEqual(evaluateForecast(options), result);
});
test('short history and long unsupported evidence report insufficient history', () => {
  assert.equal(evaluateForecast({ history: history.slice(0, 20), horizon: 14 }).status, 'insufficient_history');
  assert.equal(evaluateForecast({ history, horizon: 180 }).status, 'insufficient_history');
});
test('missing, duplicate and invalid daily records prevent evaluation', () => {
  for (const modified of [history.filter((_, index) => index !== 10), [...history.slice(0, 10), history[9], ...history.slice(10)], history.map((day, index) => index === 50 ? { ...day, revenue: NaN } : day)]) assert.equal(evaluateForecast({ history: modified }).status, 'insufficient_history');
});
test('zero revenue produces finite zero errors and synthetic evidence is labeled', () => {
  const result = evaluateForecast({ history: history.map(day => ({ ...day, revenue: 0, bookingCount: 0 })), synthetic: true });
  assert.equal(result.synthetic, true); assert.equal(result.status, 'sufficient');
  for (const score of result.targets.revenue.models) { assert.equal(score.mae, 0); assert.equal(score.rmse, 0); }
});
