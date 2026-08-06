import '../../styles/admin/analytics.css';
import { useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';



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
            backgroundColor: '#EF3E6D',
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
          x: { grid: { display: false }, ticks: { color: '#6B7280', font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(16,24,40,.06)' },
            ticks: { color: '#6B7280', font: { size: 11 }, callback: (v) => '₱' + v.toLocaleString() },
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
            backgroundColor: ['#EF3E6D', '#378ADD', '#EF9F27', '#D4537E'],
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
      cell.style.background = `rgba(239,62,109,${alpha})`;
      cell.title = `${7 + i}:00 — ${v} bookings`;
      hm.appendChild(cell);
    });
  }, []);

  return (
    <div className="panel active" id="panel-analytics">
      <div className="metric-row">
        <div className="mc">
          <div className="mc-label"><i className="ti ti-currency-peso"></i> Weekly Revenue</div>
          <div className="mc-val">₱38,200</div>
          <div className="mc-sub up"><i className="ti ti-arrow-up-right"></i> +8% vs last week</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-clock-hour-4"></i> Avg Session</div>
          <div className="mc-val">1.8 hrs</div>
          <div className="mc-sub">per booking</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-trophy"></i> Top Room</div>
          <div className="mc-val">Billiards</div>
          <div className="mc-sub">58% of bookings</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-flame"></i> Peak Hour</div>
          <div className="mc-val">7–9 PM</div>
          <div className="mc-sub">busiest window</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <div>
              <span className="card-title"><i className="ti ti-chart-bar"></i> Daily revenue this week</span>
              <p className="card-subtitle">Total booking revenue collected per day (₱)</p>
            </div>
          </div>
          <div className="legend">
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#EF3E6D' }} />
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
            <div>
              <span className="card-title"><i className="ti ti-chart-donut"></i> Bookings by room type</span>
              <p className="card-subtitle">Share of total bookings this week</p>
            </div>
          </div>
          <div className="legend">
            <div className="legend-item">
              <div className="legend-dot" style={{ background: '#EF3E6D' }} />
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
          <div className="chart-wrap chart-wrap-donut">
            <canvas ref={roomsCanvasRef} aria-label="Donut chart of bookings by room type">
              Billiards 58%, KTV 22%, Basketball Court 12%, VIP 8%.
            </canvas>
            <div className="donut-center">
              <span className="donut-center-val">142</span>
              <span className="donut-center-label">Bookings</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <span className="card-title"><i className="ti ti-clock"></i> Hourly traffic</span>
            <p className="card-subtitle">Bookings started per hour, 7AM–12AM</p>
          </div>
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
        <div className="hm-scale">
          <span>Fewer bookings</span>
          <div className="hm-scale-bar" />
          <span>More bookings</span>
        </div>
      </div>
    </div>
  );
}

export default Analytics;