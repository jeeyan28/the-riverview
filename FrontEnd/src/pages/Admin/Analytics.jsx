import '../../styles/admin/analytics.css';
import '../../styles/admin/finance.css';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import RevenueFilters from '../../components/RevenueFilters';
import RevenueSummary from '../../components/RevenueSummary';
import { useRevenueReport } from '../../hooks/useRevenueReport';
import { businessDate } from '../../utils/businessDate';
import { formatPeso } from '../../utils/currency';
import { formatTime12 } from '../../utils/time';
import { reportsService } from '../../services/reports';

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function trendLabel(period, interval) {
  if (interval === 'monthly') return new Date(`${period.start}T12:00:00+08:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if (interval === 'weekly') return `${displayDate(period.start)}–${displayDate(period.end)}`;
  return displayDate(period.start);
}

const chartTooltip = { background: '#1b2a3f', border: '1px solid #35445c', borderRadius: 10, color: '#f5f8fc', fontSize: 12 };
const chartTick = { fill: '#a8b3c4', fontSize: 11 };
const chartGrid = '#304056';

function Analytics() {
  const [from, setFrom] = useState(() => businessDate());
  const [to, setTo] = useState(() => businessDate());
  const [source, setSource] = useState('all');
  const [printRequested, setPrintRequested] = useState(false);
  const [trendInterval, setTrendInterval] = useState('daily');
  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState('');
  const { data, loading, error, reload } = useRevenueReport(from, to, source);

  useEffect(() => {
    let current = true;
    setTrendLoading(true);
    setTrendError('');
    reportsService.getConfirmedBookingTrend(trendInterval)
      .then((result) => { if (current) setTrend(result); })
      .catch((err) => { if (current) { setTrend(null); setTrendError(err.message || 'Could not load confirmed bookings.'); } })
      .finally(() => { if (current) setTrendLoading(false); });
    return () => { current = false; };
  }, [trendInterval]);

  useEffect(() => {
    if (!printRequested) return undefined;
    const frame = requestAnimationFrame(() => {
      window.print();
      setPrintRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [printRequested]);

  const trendChartData = useMemo(() => (trend?.periods || []).map((period) => ({ label: trendLabel(period, trend.interval), bookings: period.count })), [trend]);
  const revenueChartData = useMemo(() => {
    const sourceByDate = new Map((data?.daily || []).map((day) => [day.date, { label: displayDate(day.date), reservations: 0, monitoring: 0 }]));
    (data?.rows || []).forEach((row) => {
      const bucket = sourceByDate.get(row.date);
      if (bucket) bucket[row.source === 'booking' ? 'reservations' : 'monitoring'] += Number(row.collected || 0);
    });
    return [...sourceByDate.values()];
  }, [data]);
  const facilityChartData = useMemo(() => (data?.byFacility || []).slice(0, 6).map((facility) => ({ name: facility.name, collected: Number(facility.collected) || 0 })), [data]);

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

      <p className="finance-basis">Payments received excludes refunds. The chart separates reservation payments from room monitoring payments. A reservation linked to a room session is counted once, on its service date.</p>
      <RevenueSummary summary={summary} loading={loading} analytics />

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

      <section className="card confirmed-trend" aria-labelledby="confirmed-trend-title">
        <div className="confirmed-trend-head">
          <div>
            <h2 id="confirmed-trend-title" className="card-title">Confirmed Booking Trend</h2>
            <p className="finance-meta">Reservations by booked date · {trendInterval === 'daily' ? 'Last 14 days' : trendInterval === 'weekly' ? 'Last 12 weeks' : 'Last 12 months'}</p>
          </div>
          <div className="confirmed-trend-toggle" role="group" aria-label="Booking trend period">
            {['daily', 'weekly', 'monthly'].map((interval) => (
              <button key={interval} type="button" className={trendInterval === interval ? 'active' : ''} aria-pressed={trendInterval === interval} onClick={() => setTrendInterval(interval)}>{interval[0].toUpperCase() + interval.slice(1)}</button>
            ))}
          </div>
        </div>
        {trendError ? <p className="finance-error" role="alert">{trendError}</p> : trendLoading ? <p className="finance-empty" role="status">Loading booking trend…</p> : trend?.periods?.length ? (
          <div className="finance-chart confirmed-trend-chart" role="img" aria-label={`Confirmed booking counts by ${trendInterval} period`}><ResponsiveContainer width="100%" height="100%"><BarChart data={trendChartData} margin={{ top: 10, right: 8, bottom: 2, left: -22 }} accessibilityLayer><CartesianGrid vertical={false} stroke={chartGrid} strokeDasharray="3 4" /><XAxis dataKey="label" tick={chartTick} axisLine={false} tickLine={false} minTickGap={18} /><YAxis allowDecimals={false} tick={chartTick} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} formatter={(value) => [`${value} confirmed`, 'Bookings']} cursor={{ fill: 'rgba(0,201,167,.08)' }} /><Bar dataKey="bookings" fill="#00C9A7" radius={[5, 5, 0, 0]} maxBarSize={42} /></BarChart></ResponsiveContainer></div>
        ) : <p className="finance-empty">No booking trend available.</p>}
      </section>

      {loading && !data ? <div className="card finance-empty">Loading sales data…</div> : data && (
        <div className="finance-charts">
          <div className="card">
            <div className="card-head"><span className="card-title">Payments by source</span><span className="finance-meta">{displayDate(from)} – {displayDate(to)}</span></div>
            <div className="finance-chart" role="img" aria-label="Payments from reservations and room monitoring by day"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenueChartData} margin={{ top: 12, right: 14, bottom: 2, left: -12 }} accessibilityLayer><CartesianGrid vertical={false} stroke={chartGrid} strokeDasharray="3 4" /><XAxis dataKey="label" tick={chartTick} axisLine={false} tickLine={false} minTickGap={18} /><YAxis tick={chartTick} axisLine={false} tickLine={false} tickFormatter={(value) => value >= 1000 ? `₱${(value / 1000).toFixed(1)}k` : `₱${value}`} /><Tooltip contentStyle={chartTooltip} formatter={(value) => formatPeso(value)} /><Legend iconType="circle" wrapperStyle={{ color: '#a8b3c4', fontSize: 12 }} /><Area type="monotone" dataKey="reservations" name="Reservations" stroke="#00C9A7" fill="rgba(0,201,167,.14)" strokeWidth={2.5} activeDot={{ r: 5 }} /><Area type="monotone" dataKey="monitoring" name="Room monitoring" stroke="#EF9F27" fill="rgba(239,159,39,.08)" strokeWidth={2.5} activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer></div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Collected by facility</span></div>
            {data.byFacility?.length ? <div className="finance-chart" role="img" aria-label="Collected payments by facility"><ResponsiveContainer width="100%" height="100%"><BarChart data={facilityChartData} layout="vertical" margin={{ top: 10, right: 24, bottom: 0, left: 4 }} accessibilityLayer><CartesianGrid horizontal={false} stroke={chartGrid} strokeDasharray="3 4" /><XAxis type="number" tick={chartTick} axisLine={false} tickLine={false} tickFormatter={(value) => value >= 1000 ? `₱${(value / 1000).toFixed(1)}k` : `₱${value}`} /><YAxis type="category" dataKey="name" width={90} tick={chartTick} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} formatter={(value) => formatPeso(value)} cursor={{ fill: 'rgba(0,201,167,.08)' }} /><Bar dataKey="collected" name="Payments received" fill="#378ADD" radius={[0, 5, 5, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div> : <div className="finance-empty">No facility sales in this period.</div>}
          </div>
          <div className="card finance-chart-wide">
            <div className="card-head"><span className="card-title">Facility performance</span></div>
            <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Facility performance table">
              <table className="tbl">
                <thead><tr><th>Facility</th><th>Transactions</th><th>Booked hours</th><th>Booking value</th><th>Payments received</th></tr></thead>
                <tbody>
                  {data.byFacility?.length ? data.byFacility.map((facility) => (
                    <tr key={facility.name}><td>{facility.name}</td><td>{facility.transactions}</td><td>{facility.bookedHours}</td><td>{formatPeso(facility.charged)}</td><td>{formatPeso(facility.collected)}</td></tr>
                  )) : <tr><td colSpan="5" className="finance-empty">No data for this range.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><span className="card-title">Recent transactions</span><span className="finance-meta">{rows.length} in selected range</span></div>
        <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Recent sales table">
          <table className="tbl"><thead><tr><th>Date</th><th>Reference</th><th>Guest</th><th>Facility</th><th>Status</th><th>Received</th><th>Due</th></tr></thead><tbody>
            {rows.length ? rows.slice(0, 20).map((row) => <tr key={row.id}><td>{displayDate(row.date)}<div className="finance-meta">{formatTime12(row.timeIn)}</div></td><td>{row.reference}</td><td>{row.guestName}</td><td>{row.facilityName}</td><td><span className={`pill ${row.status === 'Done' || row.status === 'Finished' ? 'pill-done' : row.status === 'Cancelled' || row.status === 'No Show' ? 'pill-overdue' : 'pill-active'}`}>{row.status}</span></td><td>{formatPeso(row.collected)}</td><td>{formatPeso(row.balance)}</td></tr>) : <tr><td colSpan="7" className="finance-empty">No transactions in this period.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
