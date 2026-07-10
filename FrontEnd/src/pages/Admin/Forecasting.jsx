import { useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';



const API_BASE_URL = 'http://localhost:3000';

const TREND_WORD = { up: 'Trending up', down: 'Trending down', flat: 'Flat' };

function peso(n) {
  return '₱' + Number(n || 0).toLocaleString();
}

function Forecasting() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const revenueCanvasRef = useRef(null);
  const bookingsCanvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadForecast() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/forecast`, { credentials: 'include' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || 'Failed to load forecast.');
        if (!cancelled) setData(body);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadForecast();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build both charts once the forecast response is in. Kept in its own
  // effect (rather than inline in loadForecast) so it re-runs whenever
  // `data` changes and reliably tears down on unmount, matching
  // Analytics.jsx's create-then-destroy-on-cleanup pattern.
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
            ticks: { color: '#6B7280', font: { size: 11 }, callback: (v) => '₱' + v.toLocaleString() },
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

  return (
    <div className="panel active" id="panel-forecasting">
      <div className="metric-row" id="forecast-metrics">
        <div className="mc">
          <div className="mc-label">Revenue Trend</div>
          <div className="mc-val" id="fc-revenue-trend">
            {data ? TREND_WORD[data.trend.revenueDirection] : '—'}
          </div>
          <div className="mc-sub" id="fc-revenue-trend-sub">
            {error ? error : loading ? 'Loading…' : 'based on last 60 days'}
          </div>
        </div>
        <div className="mc">
          <div className="mc-label">Booking Trend</div>
          <div className="mc-val" id="fc-booking-trend">
            {data ? TREND_WORD[data.trend.bookingDirection] : '—'}
          </div>
          <div className="mc-sub" id="fc-booking-trend-sub">
            {/* Direct port of the original's catch block, which only ever
                overwrites fc-revenue-trend-sub on error — fc-booking-trend-sub
                is never touched, so it stays on its initial "Loading…"
                placeholder forever on failure. Keyed off `data` (not
                `loading`) so an error state (data still null) is treated
                the same as still-loading, matching that stuck behavior
                instead of incorrectly flipping to "based on last 60 days"
                alongside a "—" trend value. */}
            {data ? 'based on last 60 days' : 'Loading…'}
          </div>
        </div>
        <div className="mc">
          <div className="mc-label">Projected Revenue (next 14 days)</div>
          <div className="mc-val" id="fc-projected-revenue">
            {data ? peso(projRevenue) : '—'}
          </div>
          <div className="mc-sub">sum of daily projections</div>
        </div>
        <div className="mc">
          <div className="mc-label">Projected Bookings (next 14 days)</div>
          <div className="mc-val" id="fc-projected-bookings">
            {data ? projBookings : '—'}
          </div>
          <div className="mc-sub">sum of daily projections</div>
        </div>
      </div>

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

      {!data && error && (
        <div className="card">
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0', fontSize: '.85rem' }}>
            <i className="ti ti-lock-access" style={{ fontSize: '1.6rem', display: 'block', marginBottom: '8px' }} />
            {error}
          </div>
        </div>
      )}
    </div>
  );
}

export default Forecasting;