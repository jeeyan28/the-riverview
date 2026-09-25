import '../../styles/admin/forecasting.css';
import '../../styles/skeleton.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPeso } from '../../utils/currency';
import { API_BASE_URL } from '../../services/api';

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
    <div className="fc-chart-legend" aria-hidden="true"><span><i style={{ background: actualColor }} />Actual</span><span><i className="fc-legend-average" />Moving average</span><span><i className="fc-legend-projected" style={{ background: projectedColor }} />Projected</span><span><i className="fc-legend-band" />80% range</span></div>
    <div className="chart-wrap" role="img" aria-label={`${isRevenue ? 'Revenue' : 'Reservation'} history, moving average, projection and 80 percent forecast range`}>
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 2, left: isRevenue ? 0 : -20 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="#304056" strokeDasharray="3 4" />
        <XAxis dataKey="label" tick={{ fill: '#a8b3c4', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis tick={{ fill: '#a8b3c4', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={isRevenue} tickFormatter={(value) => isRevenue && value >= 1000 ? `₱${(value / 1000).toFixed(1)}k` : isRevenue ? `₱${value}` : value} />
        <Tooltip contentStyle={{ background: '#1b2a3f', border: '1px solid #35445c', borderRadius: 10, color: '#f5f8fc', fontSize: 12 }} formatter={(value, name) => name === '80% range' ? `${valueLabel(value[0])} – ${valueLabel(value[1])}` : valueLabel(value)} />
        <Area type="monotone" dataKey="band" name="80% range" fill="rgba(239,159,39,.15)" stroke="none" connectNulls={false} />
        <Line type="monotone" dataKey="actual" name="Actual" stroke={actualColor} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
        <Line type="monotone" dataKey="average" name="Moving average" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="3 4" dot={false} activeDot={false} connectNulls={false} />
        <Line type="monotone" dataKey="projected" name="Projected" stroke={projectedColor} strokeWidth={2.5} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
      </ComposedChart></ResponsiveContainer>
    </div>
  </>;
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


  const loadForecast = useCallback(async (window, range, cancelledRef) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ window: String(window), range });
      const res = await fetch(`${API_BASE_URL}/api/forecast?${params}`, { credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Failed to load forecast.');
      if (!cancelledRef.current) {
        setData(body);
        if (Array.isArray(body.validWindows) && body.validWindows.length) setWindowOptions(body.validWindows);
        if (Array.isArray(body.validRanges) && body.validRanges.length) setRangeOptions(body.validRanges);
      }
    } catch (err) {
      console.error(err);
      if (!cancelledRef.current) setError(err.message);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    loadForecast(smaWindow, forecastRange, cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
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
            {loading && !data ? 'Loading…' : data ? `${periodTotal(priorPeriods, 'bookingCount')} in the previous ${data.window} days` : 'Confirmed reservations'}
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
          <div className="card">
            <div className="card-head">
              <span className="card-title">Revenue: last {historyDays} days + {forecastLabel} projection</span>
              <p className="card-subtitle">Solid line is actual revenue, dashed grey is the {data.window}-day SMA, dashed orange is the trend-adjusted forecast with an 80% confidence band.</p>
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
