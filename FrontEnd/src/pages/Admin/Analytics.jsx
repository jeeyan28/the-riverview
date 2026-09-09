import '../../styles/admin/analytics.css';
import '../../styles/admin/finance.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import RevenueFilters from '../../components/RevenueFilters';
import RevenueSummary from '../../components/RevenueSummary';
import { businessDate, daysBefore, useRevenueReport } from '../../hooks/useRevenueReport';
import { formatPeso } from '../../utils/currency';

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Analytics() {
  const today = useMemo(() => businessDate(), []);
  const [from, setFrom] = useState(() => daysBefore(today, 6));
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [printRequested, setPrintRequested] = useState(false);
  const { data, loading, error, reload } = useRevenueReport(from, to, source);
  const revenueCanvasRef = useRef(null);
  const facilityCanvasRef = useRef(null);

  useEffect(() => {
    if (!printRequested) return undefined;
    const frame = requestAnimationFrame(() => {
      window.print();
      setPrintRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [printRequested]);

  useEffect(() => {
    if (!data || !revenueCanvasRef.current) return undefined;
    const app = document.querySelector('#app');
    const styles = app ? getComputedStyle(app) : null;
    const textColor = styles?.getPropertyValue('--muted').trim() || '#6B7280';
    const gridColor = styles?.getPropertyValue('--border').trim() || 'rgba(16,24,40,.08)';
    const labels = (data.daily || []).map((day) => displayDate(day.date));
    const revenueChart = new Chart(revenueCanvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Collected', data: (data.daily || []).map((day) => day.collected), borderColor: '#00C9A7', backgroundColor: 'rgba(0,201,167,.12)', fill: true, tension: .3, pointRadius: 2 },
          { label: 'Charges', data: (data.daily || []).map((day) => day.charged), borderColor: '#EF3E6D', backgroundColor: 'transparent', fill: false, tension: .3, pointRadius: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: textColor, usePointStyle: true } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${formatPeso(item.raw)}` } } },
        scales: { x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 8 } }, y: { grid: { color: gridColor }, ticks: { color: textColor, callback: (value) => formatPeso(value) } } },
      },
    });
    const facilities = (data.byFacility || []).slice(0, 6);
    const facilityChart = facilityCanvasRef.current && facilities.length ? new Chart(facilityCanvasRef.current, {
      type: 'doughnut',
      data: { labels: facilities.map((facility) => facility.name), datasets: [{ data: facilities.map((facility) => facility.collected), backgroundColor: ['#00C9A7', '#378ADD', '#EF3E6D', '#EF9F27', '#8B5CF6', '#64748B'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { position: 'bottom', labels: { color: textColor, usePointStyle: true, padding: 14 } }, tooltip: { callbacks: { label: (item) => `${item.label}: ${formatPeso(item.raw)}` } } } },
    }) : null;
    return () => {
      revenueChart.destroy();
      facilityChart?.destroy();
    };
  }, [data]);

  const peakHour = useMemo(() => {
    const hours = data?.hourly || [];
    return hours.reduce((best, item) => (item.count > (best?.count || 0) ? item : best), null);
  }, [data]);

  const summary = data?.summary;
  const rows = data?.rows || [];

  return (
    <div className="panel active" id="panel-analytics">
      <RevenueFilters
        from={from}
        to={to}
        source={source}
        onRangeChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }}
        onSourceChange={setSource}
        reload={reload}
        loading={loading}
      >
        <button type="button" className="btn-teal" onClick={() => setPrintRequested(true)} disabled={!data || loading}>
          <i className="ti ti-printer" aria-hidden="true" /> Print view
        </button>
      </RevenueFilters>

      <p className="finance-basis">Collected amounts are recorded payments less manual refunds. Linked reservations and room sessions are counted once, using service dates in Asia/Manila.</p>
      <RevenueSummary summary={summary} loading={loading} />

      {error && <div className="finance-error" role="alert">{error}</div>}
      {data?.warnings?.length > 0 && (
        <div className="finance-warning" role="status">
          <strong>Payment review needed</strong>
          <ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      <div className="finance-activity" aria-live="polite">
        <span><strong>{summary?.transactions ?? '—'}</strong> transactions</span>
        <span><strong>{summary?.reservations ?? '—'}</strong> online reservations</span>
        <span><strong>{summary?.walkins ?? '—'}</strong> walk-ins / manual bookings</span>
        <span><strong>{summary?.bookedHours ?? '—'}h</strong> booked hours</span>
        <span><strong>{summary?.averageDuration ?? '—'}h</strong> average session</span>
        <span>Peak hour: <strong>{peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'}</strong></span>
      </div>

      {loading && !data ? <div className="card finance-empty">Loading sales data…</div> : data && (
        <div className="finance-charts">
          <div className="card">
            <div className="card-head"><span className="card-title">Collected vs charges</span><span className="finance-meta">{displayDate(from)} – {displayDate(to)}</span></div>
            <div className="finance-chart"><canvas ref={revenueCanvasRef} aria-label="Collected payments and charges by day" /></div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Collected by facility</span></div>
            {data.byFacility?.length ? <div className="finance-chart"><canvas ref={facilityCanvasRef} aria-label="Collected payments by facility" /></div> : <div className="finance-empty">No facility sales in this period.</div>}
          </div>
          <div className="card finance-chart-wide">
            <div className="card-head"><span className="card-title">Facility performance</span></div>
            <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Facility performance table">
              <table className="tbl">
                <thead><tr><th>Facility</th><th>Transactions</th><th>Booked hours</th><th>Charges</th><th>Collected</th></tr></thead>
                <tbody>
                  {data.byFacility?.length ? data.byFacility.map((facility) => (
                    <tr key={facility.name}><td>{facility.name}</td><td>{facility.transactions}</td><td>{facility.bookedHours}</td><td>{formatPeso(facility.charged)}</td><td>{formatPeso(facility.collected)}</td></tr>
                  )) : <tr><td colSpan="5" className="finance-empty">No data for this range.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card finance-chart-wide">
            <details className="finance-chart-data">
              <summary>Daily detail</summary>
              <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Daily sales table">
                <table className="tbl"><thead><tr><th>Date</th><th>Transactions</th><th>Charges</th><th>Collected</th><th>Outstanding</th></tr></thead><tbody>
                  {(data.daily || []).map((day) => <tr key={day.date}><td>{displayDate(day.date)}</td><td>{day.transactions}</td><td>{formatPeso(day.charged)}</td><td>{formatPeso(day.collected)}</td><td>{formatPeso(day.outstanding)}</td></tr>)}
                </tbody></table>
              </div>
            </details>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><span className="card-title">Recent transactions</span><span className="finance-meta">{rows.length} in selected range</span></div>
        <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Recent sales table">
          <table className="tbl"><thead><tr><th>Date</th><th>Reference</th><th>Guest</th><th>Facility</th><th>Status</th><th>Collected</th><th>Balance</th></tr></thead><tbody>
            {rows.length ? rows.slice(0, 20).map((row) => <tr key={row.id}><td>{displayDate(row.date)}<div className="finance-meta">{row.timeIn || '—'}</div></td><td>{row.reference}</td><td>{row.guestName}</td><td>{row.facilityName}</td><td><span className={`pill ${row.status === 'Done' || row.status === 'Finished' ? 'pill-done' : row.status === 'Cancelled' || row.status === 'No Show' ? 'pill-overdue' : 'pill-active'}`}>{row.status}</span></td><td>{formatPeso(row.collected)}</td><td>{formatPeso(row.balance)}</td></tr>) : <tr><td colSpan="7" className="finance-empty">No transactions in this period.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
