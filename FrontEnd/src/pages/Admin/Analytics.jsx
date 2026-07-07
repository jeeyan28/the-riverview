import { useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';

// ─────────────────────────────────────────────────────────────────────────
// Admin / Analytics — migrated from admin.html's <div id="panel-analytics">
// plus admin.js's buildCharts() (the "Charts" section right before the POS
// section this file's sibling, Pos.jsx, migrated). Part of Phase 8 (Page
// Migration), continuing after Admin Dashboard, Bookings, Room Monitor,
// and POS.
//
// IMPORTANT — this panel is, and always was, entirely mock data. There is
// no GET /api/analytics or similar endpoint anywhere in Backend/routes; the
// four metric cards (Weekly Revenue, Avg Session, Top Room, Peak Hour) are
// hardcoded strings in the original admin.html, and buildCharts() feeds
// Chart.js hardcoded arrays (the revenue-by-weekday bar chart, the
// bookings-by-room-type donut, and the traffic array behind the hourly
// heatmap) — none of it reads from the server. That is preserved exactly
// as-is here: this is a like-for-like migration of a mock/placeholder
// dashboard, not a new real-data feature. If real analytics endpoints get
// built later, this is the file to wire them into.
//
// Chart.js itself was previously loaded as a global via a CDN <script> tag
// in admin.html's <head> (cdnjs Chart.js 4.4.1 UMD build). That approach
// doesn't fit a bundled Vite app, so it's now an npm dependency
// ("chart.js": "^4.4.1", added to package.json this phase) imported
// directly — same version, same API, same chart configs, just imported
// instead of global. `chart.js/auto` (not the tree-shakeable core `chart.js`
// import) is used deliberately so every chart type/plugin the original
// register-nothing UMD build provided (bar, doughnut, scales, legend,
// tooltip) is available here too, without hand-picking which sub-modules
// to register — this stays a straight port, not an optimization pass.
//
// Adapted only because this is now its own routed page instead of an
// always-mounted panel: the original built each chart exactly once ever,
// gated by a `window._chartsBuilt` flag checked in switchPanel() (so
// navigating back to Analytics a second time didn't rebuild them, since a
// Chart.js instance was already alive on that never-destroyed canvas).
// Here, this component mounts fresh every time the route is visited, so
// the two Chart instances are created in this effect and explicitly
// destroyed in its cleanup — otherwise leaving this page and coming back
// would throw Chart.js's "Canvas is already in use" error. Everything the
// charts render (labels, data, colors, options) is unchanged.
// ─────────────────────────────────────────────────────────────────────────

const HOURLY_TRAFFIC = [0, 0, 1, 2, 3, 4, 6, 8, 7, 9, 8, 6, 5, 7, 9, 10, 5];

function Analytics() {
  const revenueCanvasRef = useRef(null);
  const roomsCanvasRef = useRef(null);
  const heatmapRef = useRef(null);

  useEffect(() => {
    const revenueChart = new Chart(revenueCanvasRef.current, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'Revenue',
            data: [4200, 5100, 4800, 6450, 7200, 6900, 3550],
            backgroundColor: '#00C9A7',
            borderRadius: 5,
            barPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8A9BB0', font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(255,255,255,.06)' },
            ticks: { color: '#8A9BB0', font: { size: 11 }, callback: (v) => '₱' + v.toLocaleString() },
          },
        },
      },
    });

    const roomsChart = new Chart(roomsCanvasRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Billiards', 'KTV', 'Court', 'VIP'],
        datasets: [
          {
            data: [58, 22, 12, 8],
            backgroundColor: ['#00C9A7', '#378ADD', '#EF9F27', '#D4537E'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '65%',
      },
    });

    return () => {
      revenueChart.destroy();
      roomsChart.destroy();
    };
  }, []);

  useEffect(() => {
    const hm = heatmapRef.current;
    if (!hm) return;
    const max = Math.max(...HOURLY_TRAFFIC);
    hm.innerHTML = '';
    HOURLY_TRAFFIC.forEach((v, i) => {
      const cell = document.createElement('div');
      cell.className = 'hm-cell';
      const alpha = (0.08 + (v / max) * 0.82).toFixed(2);
      cell.style.background = `rgba(0,201,167,${alpha})`;
      cell.title = `${7 + i}:00 — ${v} bookings`;
      hm.appendChild(cell);
    });
  }, []);

  return (
    <div className="panel active" id="panel-analytics">
      <div className="metric-row">
        <div className="mc">
          <div className="mc-label">Weekly Revenue</div>
          <div className="mc-val">₱38,200</div>
          <div className="mc-sub up">+8% vs last week</div>
        </div>
        <div className="mc">
          <div className="mc-label">Avg Session</div>
          <div className="mc-val">1.8 hrs</div>
          <div className="mc-sub">per booking</div>
        </div>
        <div className="mc">
          <div className="mc-label">Top Room</div>
          <div className="mc-val">Billiards</div>
          <div className="mc-sub">58% of bookings</div>
        </div>
        <div className="mc">
          <div className="mc-label">Peak Hour</div>
          <div className="mc-val">7–9 PM</div>
          <div className="mc-sub">busiest window</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Daily revenue this week (₱)</span>
          </div>
          <div className="legend">
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#00C9A7' }} />
              Revenue
            </div>
          </div>
          <div className="chart-wrap">
            <canvas ref={revenueCanvasRef} aria-label="Daily revenue bar chart this week">
              Mon 4200, Tue 5100, Wed 4800, Thu 6450, Fri 7200, Sat 6900, Sun 3550.
            </canvas>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <span className="card-title">Bookings by room type</span>
          </div>
          <div className="legend">
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#00C9A7' }} />
              Billiards 58%
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#378ADD' }} />
              KTV 22%
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#EF9F27' }} />
              Court 12%
            </div>
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#D4537E' }} />
              VIP 8%
            </div>
          </div>
          <div className="chart-wrap">
            <canvas ref={roomsCanvasRef} aria-label="Donut chart of bookings by room type">
              Billiards 58%, KTV 22%, Basketball Court 12%, VIP 8%.
            </canvas>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Hourly traffic — bookings per hour</span>
        </div>
        <div id="heatmap" ref={heatmapRef} />
        <div className="hm-labels">
          <span>7AM</span>
          <span>10AM</span>
          <span>1PM</span>
          <span>4PM</span>
          <span>7PM</span>
          <span>10PM</span>
          <span>12AM</span>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
