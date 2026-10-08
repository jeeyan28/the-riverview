import '../../styles/admin/forecasting.css';
import '../../styles/skeleton.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPeso } from '../../utils/currency';
import { reportsService } from '../../services/reports';

const DEFAULT_RANGES = [
  { value: 'daily', label: 'Daily', forecastLabel: 'next 14 days' },
  { value: 'weekly', label: 'Weekly', forecastLabel: 'next 8 weeks' },
  { value: 'monthly', label: 'Monthly', forecastLabel: 'next 6 months' },
];
const INSIGHT_ICON = {
  'trending-up': 'ti-trending-up',
  'trending-down': 'ti-trending-down',
  'calendar-star': 'ti-calendar-event',
  'calendar-off': 'ti-calendar-off',
  'chart-histogram': 'ti-chart-histogram',
  'alert-triangle': 'ti-alert-triangle',
  'alert-circle': 'ti-alert-circle',
  door: 'ti-door',
};

function ForecastLineChart({ data, kind }) {
  const isRevenue = kind === 'revenue';
  const rangeLabel = data.rangeLabel || 'Heuristic variability range';
  const chartData = useMemo(() => {
    const actualKey = isRevenue ? 'revenue' : 'bookingCount';
    const averageKey = isRevenue ? 'smaRevenue' : 'smaBookings';
    const projectedKey = isRevenue ? 'projectedRevenue' : 'projectedBookings';
    const history = data.history.map((item) => ({ label: item.date.slice(5), actual: item[actualKey], average: item[averageKey], projected: null, band: null }));
    if (history.length) history[history.length - 1].projected = history[history.length - 1].actual;
    return history.concat(data.projection.map((item) => ({
      label: item.date.slice(5), actual: null, average: null,
      projected: item[projectedKey],
      band: [item[`${projectedKey}Low`], item[`${projectedKey}High`]],
    })));
  }, [data, isRevenue]);
  const actualColor = isRevenue ? '#EF3E6D' : '#378ADD';
  const projectedColor = isRevenue ? '#EF9F27' : '#D4537E';
  const valueLabel = (value) => isRevenue ? formatPeso(value) : Number(value).toLocaleString();
  return <>
    <div className="fc-chart-legend" aria-hidden="true"><span><i style={{ background: actualColor }} />Actual</span><span><i className="fc-legend-average" />Moving average</span><span><i className="fc-legend-projected" style={{ background: projectedColor }} />Projected</span><span><i className="fc-legend-band" />{rangeLabel}</span></div>
    <div className="chart-wrap" role="img" aria-label={`${isRevenue ? 'Revenue' : 'Reservation'} history, moving average, projection and heuristic variability range`}>
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 2, left: isRevenue ? 0 : -20 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="#304056" strokeDasharray="3 4" />
        <XAxis dataKey="label" tick={{ fill: '#a8b3c4', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis tick={{ fill: '#a8b3c4', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={isRevenue} tickFormatter={(value) => isRevenue && value >= 1000 ? `₱${(value / 1000).toFixed(1)}k` : isRevenue ? `₱${value}` : value} />
        <Tooltip contentStyle={{ background: '#1b2a3f', border: '1px solid #35445c', borderRadius: 10, color: '#f5f8fc', fontSize: 12 }} formatter={(value, name) => name === rangeLabel ? `${valueLabel(value[0])} – ${valueLabel(value[1])}` : valueLabel(value)} />
        <Area type="monotone" dataKey="band" name={rangeLabel} fill="rgba(239,159,39,.15)" stroke="none" connectNulls={false} />
        <Line type="monotone" dataKey="actual" name="Actual" stroke={actualColor} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
        <Line type="monotone" dataKey="average" name="Moving average" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="3 4" dot={false} activeDot={false} connectNulls={false} />
        <Line type="monotone" dataKey="projected" name="Projected" stroke={projectedColor} strokeWidth={2.5} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
      </ComposedChart></ResponsiveContainer>
    </div>
  </>;
}

function ForecastEvaluation({ data }) {
  const evaluation = data.evaluation;
  const sufficient = evaluation?.status === 'sufficient';
  const modelLabel = data.model?.label || 'Trend-adjusted moving average';
  const historyFrom = data.history[0]?.date || '—';
  const historyTo = data.history.at(-1)?.date || '—';
  const forecastFrom = data.projection[0]?.date || '—';
  const forecastTo = data.projection.at(-1)?.date || '—';
  const number = (value) => Number.isFinite(value) ? value.toLocaleString('en-PH', { maximumFractionDigits: 2 }) : '—';
  const metric = (value, revenue) => Number.isFinite(value) ? (revenue ? '₱' : '') + number(value) : '—';
  const timestamp = evaluation?.evaluatedAt ? new Date(evaluation.evaluatedAt) : null;
  const evaluatedLabel = timestamp && Number.isFinite(timestamp.getTime())
    ? timestamp.toLocaleString('en-PH', { timeZone: evaluation.timeZone || 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <section className="card" aria-labelledby="fc-evaluation-title">
      <div className="card-head">
        <h2 className="card-title" id="fc-evaluation-title">Forecast evaluation</h2>
        <p className="card-subtitle">{modelLabel} · {data.window}-day average. Estimates do not guarantee future results.</p>
        <p className="card-subtitle">History: {historyFrom} – {historyTo}. Forecast: {forecastFrom} – {forecastTo}. {data.timeZone || 'Asia/Manila'}.</p>
      </div>
      {(data.synthetic || evaluation?.synthetic) && (
        <p className="fc-ai-fallback" role="status"><strong>Synthetic demo data.</strong> These results do not establish accuracy on the venue's real operations.</p>
      )}
      {!sufficient ? (
        <p className="fc-ai-fallback" role="status">{evaluation?.reason || 'Insufficient history: forecast evaluation is not available for this range.'}</p>
      ) : (
        <>
          <p className="card-subtitle">{evaluation.horizonDays}-day horizon · {evaluation.foldCount} historical forecast origins · {evaluation.sampleCount} daily comparisons per target · {evaluation.evaluationPeriod.from} – {evaluation.evaluationPeriod.to}.</p>
          <div className="fc-ai-columns">
            {['revenue', 'bookings'].map((target) => {
              const results = evaluation.targets[target];
              const revenue = target === 'revenue';
              const current = results.models.find((model) => model.id === evaluation.modelId);
              const recommended = results.models.find((model) => model.id === results.recommendedModelId);
              return (
                <div key={target}>
                  <h3 className="fc-ai-section-title">{revenue ? 'Revenue error · ₱ per day' : 'Reservation error · per day'}</h3>
                  <p className="fc-ai-summary">Average historical error: {metric(current?.mae, revenue)} {revenue ? 'per day' : 'reservations per day'}.</p>
                  <div className="admin-table-scroll admin-table-scroll-compact" tabIndex={0} role="region" aria-label={(revenue ? 'Revenue' : 'Reservation') + ' forecast model comparison'}>
                    <table className="tbl">
                      <thead><tr><th scope="col">Model</th><th scope="col"><abbr title="Mean absolute error">MAE</abbr></th><th scope="col"><abbr title="Root mean squared error">RMSE</abbr></th></tr></thead>
                      <tbody>
                        {results.models.map((model) => (
                          <tr key={model.id}>
                            <th scope="row">{model.label}{model.id === evaluation.modelId ? ' (in use)' : ''}</th>
                            <td>{metric(model.mae, revenue)}</td>
                            <td>{metric(model.rmse, revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="card-subtitle">{results.baselineBeatsCurrent
                    ? recommended.label + ' had lower historical error. Consider this baseline when planning; the displayed forecast still uses ' + modelLabel + '.'
                    : 'The displayed model matched or beat both baselines on mean absolute error.'}</p>
                </div>
              );
            })}
          </div>
          <p className="card-subtitle">MAE is the average absolute error. RMSE gives larger errors more weight. Every prediction uses only business dates before its forecast origin; evaluation periods can overlap.</p>
        </>
      )}
      <p className="card-subtitle">{data.rangeExplanation || 'The shaded range is heuristic; its probability coverage has not been measured.'}</p>
      {evaluation && (
        <details>
          <summary>Evaluation details</summary>
          <p className="card-subtitle">Model version: {evaluation.modelVersion}. {evaluatedLabel ? 'Evaluated ' + evaluatedLabel + ' (Asia/Manila).' : ''}</p>
          {['revenue', 'bookings', 'zeroDays', 'missingDates', 'outliers', 'closures', 'revisions'].map((key) => evaluation.definitions?.[key] && <p className="card-subtitle" key={key}>{evaluation.definitions[key]}</p>)}
        </details>
      )}
    </section>
  );
}

function Forecasting() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [smaWindow, setSmaWindow] = useState(7);
  const [windowOptions, setWindowOptions] = useState([7]);
  const [forecastRange, setForecastRange] = useState('daily');
  const [rangeOptions, setRangeOptions] = useState(DEFAULT_RANGES);
  const [retryKey, setRetryKey] = useState(0);


  const loadForecast = useCallback(async (window, range, signal) => {
    setLoading(true);
    setError(null);
    try {
      const body = await reportsService.getForecast(window, range, { signal });
      if (!signal.aborted) {
        setData(body);
        if (Array.isArray(body.validWindows) && body.validWindows.length) setWindowOptions(body.validWindows);
        if (Array.isArray(body.validRanges) && body.validRanges.length) setRangeOptions(body.validRanges);
      }
    } catch (err) {
      if (!signal.aborted) {
        console.error(err);
        setError(err.message);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadForecast(smaWindow, forecastRange, controller.signal);
    return () => controller.abort();
  }, [smaWindow, forecastRange, retryKey, loadForecast]);

  const projRevenue = data ? data.projection.reduce((s, p) => s + p.projectedRevenue, 0) : 0;
  const projBookings = data ? data.projection.reduce((s, p) => s + p.projectedBookings, 0) : 0;
  const bestDay = data?.seasonality?.revenue?.best;
  const recentPeriods = data?.history.slice(-data.window) || [];
  const priorPeriods = data?.history.slice(-2 * data.window, -data.window) || [];
  const periodTotal = (periods, field) => periods.reduce((sum, item) => sum + Number(item[field] || 0), 0);

  const weekdayMax = data
    ? Math.max(1, ...data.seasonality.revenue.byWeekday.map((w) => w.average))
    : 1;
  const selectedRange = rangeOptions.find((option) => option.value === forecastRange) || DEFAULT_RANGES[0];
  const forecastLabel = data?.forecastLabel || selectedRange.forecastLabel;
  const historyDays = data?.historyDays || (forecastRange === 'monthly' ? 365 : forecastRange === 'weekly' ? 180 : 60);

  return (
    <div className="panel active" id="panel-forecasting">
      <div className="fc-filter-bar">
        <label htmlFor="fc-forecast-range">Forecast range
          <select id="fc-forecast-range" className="users-filter-input" value={forecastRange} onChange={(event) => setForecastRange(event.target.value)}>
            {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.forecastLabel}</option>)}
          </select>
        </label>
        <label htmlFor="fc-sma-window">Average over
          <select id="fc-sma-window" className="users-filter-input" value={smaWindow} onChange={(event) => setSmaWindow(Number(event.target.value))}>
            {windowOptions.map((window) => <option key={window} value={window}>{window} days</option>)}
          </select>
        </label>
      </div>
      <div className="metric-row" id="forecast-metrics">
        <div className="mc">
          <div className="mc-label"><i className="ti ti-trending-up"></i>Revenue · last {data?.window || smaWindow} days</div>
          <div className="mc-val" id="fc-revenue-trend">
            {data ? formatPeso(periodTotal(recentPeriods, 'revenue')) : '—'}
          </div>
          <div className="mc-sub" id="fc-revenue-trend-sub">
            {error ? error : loading && !data ? 'Loading…' : data ? `${formatPeso(periodTotal(priorPeriods, 'revenue'))} in the previous ${data.window} days` : 'Recorded revenue'}
          </div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-calendar-stats"></i>Reservations · last {data?.window || smaWindow} days</div>
          <div className="mc-val" id="fc-booking-trend">
            {data ? periodTotal(recentPeriods, 'bookingCount') : '—'}
          </div>
          <div className="mc-sub" id="fc-booking-trend-sub">
            {loading && !data ? 'Loading…' : data ? `${periodTotal(priorPeriods, 'bookingCount')} in the previous ${data.window} days` : 'Eligible reservations'}
          </div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-cash"></i>Projected Revenue ({forecastLabel})</div>
          <div className="mc-val" id="fc-projected-revenue">
            {data ? formatPeso(projRevenue) : '—'}
          </div>
          <div className="mc-sub">Estimate based on recent activity</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-calendar-event"></i>Projected Reservations ({forecastLabel})</div>
          <div className="mc-val" id="fc-projected-bookings">
            {data ? projBookings : '—'}
          </div>
          <div className="mc-sub">Estimate based on recent reservations</div>
        </div>
      </div>

      {!data && loading && (
        <>
          <div className="card">
            <div className="card-head">
              <span className="card-title">Revenue: last {historyDays} days + {forecastLabel} projection</span>
            </div>
            <div className="chart-wrap"><div className="skeleton fc-chart-skeleton" /></div>
          </div>
          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <span className="card-title">Reservations: last {historyDays} days + {forecastLabel} projection</span>
              </div>
              <div className="chart-wrap"><div className="skeleton fc-chart-skeleton" /></div>
            </div>
            <div className="card">
              <div className="card-head">
                <span className="card-title">Top room demand (last {historyDays} days)</span>
              </div>
              <div className="fc-table-skeleton">
                <div className="skeleton fc-skeleton-row" />
                <div className="skeleton fc-skeleton-row" />
                <div className="skeleton fc-skeleton-row" />
              </div>
            </div>
          </div>
        </>
      )}

      {data && (
        <>
          {loading && <p className="fc-ai-fallback" role="status">Updating forecast… The previous results remain visible until the new range loads.</p>}
          {error && !loading && <div className="fc-ai-fallback" role="alert"><span>{error} Previous results are still shown.</span><button type="button" className="btn-teal" onClick={() => setRetryKey((key) => key + 1)}>Retry</button></div>}
          <ForecastEvaluation data={data} />
          <div className="card">
            <div className="card-head">
              <span className="card-title">Revenue: last {historyDays} days + {forecastLabel} projection</span>
              <p className="card-subtitle">Solid line is recorded revenue, dashed grey is the {data.window}-day average, and dashed orange is the forecast. The shaded area shows a heuristic variability range.</p>
            </div>
            <ForecastLineChart data={data} kind="revenue" />
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <span className="card-title">Reservations: last {historyDays} days + {forecastLabel} projection</span>
              </div>
              <ForecastLineChart data={data} kind="bookings" />
            </div>
            <div className="card">
              <div className="card-head">
                <span className="card-title">Top room demand (last {historyDays} days)</span>
              </div>
              <div className="admin-table-scroll admin-table-scroll-compact" tabIndex={0} role="region" aria-label="Top room demand table">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Reservations</th>
                    </tr>
                  </thead>
                  <tbody id="fc-top-rooms">
                    {data.topRooms.length ? (
                      data.topRooms.map((r, index) => (
                        <tr key={`${r.roomLabel}-${index}`}>
                          <td>{r.roomLabel}</td>
                          <td>{r.count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0' }}>
                          No reservation data yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">
                <i className="ti ti-chart-dots"></i> Forecast Briefing
                <span className="fc-ai-badge"><i className="ti ti-calculator"></i>Statistical model</span>
              </span>
              <p className="card-subtitle">
                A plain-language summary generated directly from the moving average, seasonality, volatility, and anomaly results.
              </p>
            </div>
            {data.briefing ? (
              <>
                <p className="fc-ai-summary">{data.briefing.summary}</p>
                <div className="fc-ai-columns">
                  {data.briefing.actions?.length > 0 && (
                    <div>
                      <p className="fc-ai-section-title"><i className="ti ti-bulb"></i>Suggested actions</p>
                      <ul className="fc-ai-list">
                        {data.briefing.actions.map((r, i) => (
                          <li key={i}><i className="ti ti-circle-check"></i>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.briefing.risks?.length > 0 && (
                    <div>
                      <p className="fc-ai-section-title"><i className="ti ti-alert-triangle"></i>Watch items</p>
                      <ul className="fc-ai-list risks">
                        {data.briefing.risks.map((r, i) => (
                          <li key={i}><i className="ti ti-point"></i>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <p className="card-subtitle">Method: {data.briefing.method}</p>
              </>
            ) : (
              <div className="fc-ai-fallback">
                <i className="ti ti-info-circle" style={{ fontSize: '1.1rem' }}></i>
                <span>There is not enough recorded activity to prepare a forecast briefing yet.</span>
              </div>
            )}
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <span className="card-title"><i className="ti ti-chart-histogram"></i> Computed Signals</span>
                <p className="card-subtitle">Trend, seasonality, and anomaly signals computed directly from the selected moving-average window.</p>
              </div>
              {data.insights.length ? (
                <ul className="fc-insights-list">
                  {data.insights.map((insight, i) => (
                    <li className="fc-insight" key={i}>
                      <span className="fc-insight-icon"><i className={`ti ${INSIGHT_ICON[insight.icon] || 'ti-info-circle'}`}></i></span>
                      <span className="fc-insight-text">{insight.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0', fontSize: '.85rem' }}>
                  Not enough data yet to generate insights.
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-head">
                <span className="card-title">Revenue by Day of Week</span>
                <p className="card-subtitle">Average revenue per weekday, last {historyDays} days.{bestDay ? ` Best day: ${bestDay.day} (${formatPeso(bestDay.average)} average).` : ''}</p>
              </div>
              <div className="fc-weekday-list">
                {data.seasonality.revenue.byWeekday.map((w) => (
                  <div className="fc-weekday-row" key={w.day}>
                    <span className="fc-weekday-name">{w.day}</span>
                    <span className="fc-weekday-bar-track">
                      <span
                        className={`fc-weekday-bar-fill ${data.seasonality.revenue.best?.day === w.day ? 'best' : ''} ${data.seasonality.revenue.worst?.day === w.day ? 'worst' : ''}`}
                        style={{ width: `${w.average > 0 ? Math.max(4, (w.average / weekdayMax) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="fc-weekday-val">{formatPeso(w.average)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {!data && error && !loading && (
        <div className="card">
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0', fontSize: '.85rem' }}>
            <i className="ti ti-lock-access" style={{ fontSize: '1.6rem', display: 'block', marginBottom: '8px' }} />
            {error}
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn-teal" style={{ margin: '0 auto' }} onClick={() => setRetryKey((k) => k + 1)}>
                <i className="ti ti-refresh"></i> Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Forecasting;
