import '../../styles/admin/forecasting.css';
import '../../styles/skeleton.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import { formatPeso } from '../../utils/currency';
import { API_BASE_URL } from '../../services/api';

const TREND_WORD = { up: 'Trending up', down: 'Trending down', flat: 'Flat' };

function Forecasting() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [smaWindow, setSmaWindow] = useState(7);
  const [windowOptions, setWindowOptions] = useState([7]);
  const [retryKey, setRetryKey] = useState(0);

  const revenueCanvasRef = useRef(null);
  const bookingsCanvasRef = useRef(null);

  const loadForecast = useCallback(async (window, cancelledRef) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/forecast?window=${window}`, { credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Failed to load forecast.');
      if (!cancelledRef.current) {
        setData(body);
        if (Array.isArray(body.validWindows) && body.validWindows.length) setWindowOptions(body.validWindows);
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
    loadForecast(smaWindow, cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [smaWindow, retryKey, loadForecast]);

  useEffect(() => {
    if (!data) return;

    const historyLabels = data.history.map((h) => h.date.slice(5));
    const projLabels = data.projection.map((p) => p.date.slice(5));
    const allLabels = [...historyLabels, ...projLabels];

    const revenueHistory = data.history.map((h) => h.revenue);
    const revenueProjection = new Array(historyLabels.length - 1)
      .fill(null)
      .concat([revenueHistory[revenueHistory.length - 1]])
      .concat(data.projection.map((p) => p.projectedRevenue));

    const revenueChart = new Chart(revenueCanvasRef.current, {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          {
            label: 'Actual',
            data: [...revenueHistory, ...new Array(projLabels.length).fill(null)],
            borderColor: '#EF3E6D',
            backgroundColor: 'rgba(239,62,109,.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
          },
          {
            label: 'Projected',
            data: revenueProjection,
            borderColor: '#EF9F27',
            borderDash: [5, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#1A1D29' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6B7280', font: { size: 10 }, maxTicksLimit: 10 } },
          y: {
            grid: { color: 'rgba(16,24,40,.06)' },
            ticks: { color: '#6B7280', font: { size: 11 }, callback: (v) => formatPeso(v) },
          },
        },
      },
    });

    const bookingHistory = data.history.map((h) => h.bookingCount);
    const bookingProjection = new Array(historyLabels.length - 1)
      .fill(null)
      .concat([bookingHistory[bookingHistory.length - 1]])
      .concat(data.projection.map((p) => p.projectedBookings));

    const bookingsChart = new Chart(bookingsCanvasRef.current, {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          {
            label: 'Actual',
            data: [...bookingHistory, ...new Array(projLabels.length).fill(null)],
            borderColor: '#378ADD',
            backgroundColor: 'rgba(55,138,221,.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
          },
          {
            label: 'Projected',
            data: bookingProjection,
            borderColor: '#D4537E',
            borderDash: [5, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#1A1D29' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6B7280', font: { size: 10 }, maxTicksLimit: 10 } },
          y: { grid: { color: 'rgba(16,24,40,.06)' }, ticks: { color: '#6B7280', font: { size: 11 } } },
        },
      },
    });

    return () => {
      revenueChart.destroy();
      bookingsChart.destroy();
    };
  }, [data]);

  const projRevenue = data ? data.projection.reduce((s, p) => s + p.projectedRevenue, 0) : 0;
  const projBookings = data ? data.projection.reduce((s, p) => s + p.projectedBookings, 0) : 0;
  const revenuePercent = data?.trend?.revenuePercent ?? 0;
  const bookingPercent = data?.trend?.bookingPercent ?? 0;

  return (
    <div className="panel active" id="panel-forecasting">
      <div className="metric-row" id="forecast-metrics">
        <div className="mc">
          <div className="mc-label"><i className="ti ti-trending-up"></i>Revenue Trend</div>
          <div className="mc-val" id="fc-revenue-trend">
            {data ? TREND_WORD[data.trend.revenueDirection] : '—'}
          </div>
          <div className={`mc-sub ${data && data.trend.revenueDirection === 'up' ? 'up' : data && data.trend.revenueDirection === 'down' ? 'dn' : ''}`} id="fc-revenue-trend-sub">
            {error ? error : loading && !data ? 'Loading…' : data ? (
              <>
                {data.trend.revenueDirection !== 'flat' && (
                  <i className={`ti ${data.trend.revenueDirection === 'up' ? 'ti-trending-up' : 'ti-trending-down'}`}></i>
                )}
                {data.trend.revenueDirection === 'flat' ? 'Flat vs prior period' : `${revenuePercent > 0 ? '+' : ''}${revenuePercent}% vs prior period`}
              </>
            ) : 'based on last 60 days'}
          </div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-calendar-stats"></i>Booking Trend</div>
          <div className="mc-val" id="fc-booking-trend">
            {data ? TREND_WORD[data.trend.bookingDirection] : '—'}
          </div>
          <div className={`mc-sub ${data && data.trend.bookingDirection === 'up' ? 'up' : data && data.trend.bookingDirection === 'down' ? 'dn' : ''}`} id="fc-booking-trend-sub">
            {loading && !data ? 'Loading…' : data ? (
              <>
                {data.trend.bookingDirection !== 'flat' && (
                  <i className={`ti ${data.trend.bookingDirection === 'up' ? 'ti-trending-up' : 'ti-trending-down'}`}></i>
                )}
                {data.trend.bookingDirection === 'flat' ? 'Flat vs prior period' : `${bookingPercent > 0 ? '+' : ''}${bookingPercent}% vs prior period`}
              </>
            ) : 'based on last 60 days'}
          </div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-cash"></i>Projected Revenue (next 14 days)</div>
          <div className="mc-val" id="fc-projected-revenue">
            {data ? formatPeso(projRevenue) : '—'}
          </div>
          <div className="mc-sub">sum of daily projections</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-calendar-event"></i>Projected Bookings (next 14 days)</div>
          <div className="mc-val" id="fc-projected-bookings">
            {data ? projBookings : '—'}
          </div>
          <div className="mc-sub">sum of daily projections</div>
        </div>
        <div className="mc">
          <label className="mc-label" htmlFor="fc-sma-window"><i className="ti ti-adjustments-horizontal"></i>SMA Window</label>
          <select
            id="fc-sma-window"
            className="users-filter-input fc-sma-select"
            value={smaWindow}
            onChange={(e) => setSmaWindow(Number(e.target.value))}
          >
            {windowOptions.map((w) => (
              <option key={w} value={w}>
                {w} days
              </option>
            ))}
          </select>
          <div className="mc-sub">averaging window</div>
        </div>
      </div>

      {!data && loading && (
        <>
          <div className="card">
            <div className="card-head">
              <span className="card-title">Revenue: last 60 days + 14-day projection</span>
            </div>
            <div className="chart-wrap"><div className="skeleton fc-chart-skeleton" /></div>
          </div>
          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <span className="card-title">Bookings: last 60 days + 14-day projection</span>
              </div>
              <div className="chart-wrap"><div className="skeleton fc-chart-skeleton" /></div>
            </div>
            <div className="card">
              <div className="card-head">
                <span className="card-title">Top room demand (last 60 days)</span>
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
              <span className="card-title">Revenue: last 60 days + 14-day projection</span>
            </div>
            <div className="chart-wrap">
              <canvas ref={revenueCanvasRef} id="c-forecast-revenue" aria-label="Revenue history and forecast chart" />
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <span className="card-title">Bookings: last 60 days + 14-day projection</span>
              </div>
              <div className="chart-wrap">
                <canvas
                  ref={bookingsCanvasRef}
                  id="c-forecast-bookings"
                  aria-label="Booking count history and forecast chart"
                />
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <span className="card-title">Top room demand (last 60 days)</span>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Bookings</th>
                  </tr>
                </thead>
                <tbody id="fc-top-rooms">
                  {data.topRooms.length ? (
                    data.topRooms.map((r) => (
                      <tr key={r.roomLabel}>
                        <td>{r.roomLabel}</td>
                        <td>{r.count}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0' }}>
                        No booking data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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