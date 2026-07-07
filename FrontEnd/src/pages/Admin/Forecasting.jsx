import { useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';

// ─────────────────────────────────────────────────────────────────────────
// Admin / Forecasting — migrated from admin.html's <div id="panel-forecasting">
// plus admin.js's renderForecastPanel() (the "FORECASTING (Owner only)"
// section, right after Manage Users). Phase 10 (Page Migration) — this was
// the one real panel left unmigrated after Phase 9 (Profile); /admin/logs
// stays a TempPage permanently by design (see App.jsx's routing comment),
// so this completes panel migration.
//
// UNLIKE Analytics.jsx, this panel is real, live data: GET /api/forecast
// (Backend/routes/forecastRoutes.js) buckets the last 60 days of bookings
// + POS sales by day, fits a simple linear regression to revenue and
// booking-count, and returns that 60-day history plus a 14-day projection
// and top-5 room demand. No mock data here, ported 1:1 from
// renderForecastPanel() — same peso formatting, same trend-word mapping,
// same chart configs/colors, same "last actual point repeated as first
// projection point" trick so the dashed projection line connects visually
// to the solid history line instead of leaving a gap.
//
// Chart.js: same `chart.js/auto` npm import Analytics.jsx already
// established this phase for Vite (replacing the old CDN <script> global).
// Both charts are created in an effect keyed on `data` (once the forecast
// response arrives) and destroyed on cleanup/re-run, same reasoning as
// Analytics.jsx: this component can mount/unmount/re-mount across route
// visits, and Chart.js throws if you reuse a canvas with a stale instance
// still attached.
//
// Loading/error state: the original didn't have a page-level loading
// skeleton (the panel just showed "—" / "Loading…" placeholder text in the
// static HTML until renderForecastPanel() overwrote it, and only wrote an
// error into the one fc-revenue-trend-sub element on failure). Reworked
// here as real React state (`loading` / `error`) since this is now an
// always-fresh mount rather than a lazily-first-rendered panel — but the
// *content* of the error path is preserved: a 403 from requirePermission
// (Owner-only route) surfaces its server message ("You do not have
// permission to do that.") exactly as the original's catch block would
// have shown it, just now in a full-width notice instead of one metric's
// subtitle, since without a loaded chart there's nothing else to render.
//
// DEFERRED, same as every other admin page so far: permission gating.
// admin.html gated this whole panel two ways — data-requires-permission=
// "forecasting:view" on the outer <div> (hide-if-lacking, via
// applyRoleVisibility()) and a client-side guardPermission('forecasting:
// view', …) check at the top of renderForecastPanel() (alert-and-return
// before fetching). Neither is implemented yet — no session role/
// permission list available client-side until Phase 11's AuthContext.
// Today, every authenticated admin sees this route and fires the fetch;
// the server's requirePermission(PERMISSIONS.FORECASTING_VIEW) middleware
// still independently enforces Owner-only access and returns a 403 with a
// clear message, which is what actually stops a non-Owner here for now
// (rendered via the `error` state below, not a client-side pre-check).
// ─────────────────────────────────────────────────────────────────────────

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
            borderColor: '#00C9A7',
            backgroundColor: 'rgba(0,201,167,.1)',
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
        plugins: { legend: { labels: { color: '#c8d6e5' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8A9BB0', font: { size: 10 }, maxTicksLimit: 10 } },
          y: {
            grid: { color: 'rgba(255,255,255,.06)' },
            ticks: { color: '#8A9BB0', font: { size: 11 }, callback: (v) => '₱' + v.toLocaleString() },
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
        plugins: { legend: { labels: { color: '#c8d6e5' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8A9BB0', font: { size: 10 }, maxTicksLimit: 10 } },
          y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#8A9BB0', font: { size: 11 } } },
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