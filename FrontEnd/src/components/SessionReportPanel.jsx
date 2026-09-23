import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import DateRangePicker from './DateRangePicker';
import { roomSessionsService } from '../services/monitoring';
import { businessDate } from '../utils/businessDate';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SessionReportPanel() {
  const [from, setFrom] = useState(() => businessDate());
  const [to, setTo] = useState(() => businessDate());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const hasRange = Boolean(from && to);

  async function loadReport() {
    if (!hasRange) return;
    setLoading(true);
    setError('');
    try {
      setReport(await roomSessionsService.report(from, to));
    } catch (err) {
      setError(err.message || 'Could not load the session report.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasRange) {
      setReport(null);
      setError('');
      setLoading(false);
      return;
    }
    loadReport();
  }, [from, to]);

  async function exportReport() {
    if (!hasRange) return;
    setExporting(true);
    setError('');
    try {
      await roomSessionsService.exportReport(from, to);
    } catch (err) {
      setError(err.message || 'Could not export the session report.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="monitor-report reports-session-panel" aria-label="Played sessions">
      <div className="monitor-report-filters">
        <DateRangePicker from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }} />
        <div className="monitor-report-filter-actions">
          <button type="button" className="btn-cancel" onClick={loadReport} disabled={!hasRange || loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="save-btn" onClick={exportReport} disabled={!hasRange || loading || exporting}>
            <Download size={16} aria-hidden="true" />{exporting ? 'Generating…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {error && <div className="finance-error" role="alert">{error}</div>}

      <div className="monitor-report-summary" aria-label="Session totals">
        <div><span>Paid sessions</span><strong>{!hasRange || (loading && !report) ? '—' : report?.summary?.sessions ?? 0}</strong><small>{hasRange ? `${report?.summary?.hours ?? 0} occupied hours` : 'Choose service dates'}</small></div>
        <div><span>Hourly charges</span><strong>{hasRange && report ? money(report.summary?.charged) : '—'}</strong><small>Room and facility time</small></div>
        <div><span>Collected</span><strong>{hasRange && report ? money(report.summary?.collected) : '—'}</strong><small>Paid in full</small></div>
      </div>

      <div className="monitor-report-layout">
        <div className="card card-flush monitor-report-table-card">
          <div className="monitor-report-card-head"><div><h3>Session activity</h3><p>Finished sessions paid in full.</p></div><span>{report?.rows?.length ?? 0} rows</span></div>
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Live monitor session report">
            <table className="tbl monitor-report-table">
              <thead><tr><th>Date / time</th><th>Facility / room</th><th>Guest</th><th>Source</th><th>Hours</th><th>Rate</th><th>Charge</th><th>Paid</th><th>Payment</th></tr></thead>
              <tbody>
                {!hasRange ? <tr><td colSpan="9" className="finance-empty">Choose service dates to load paid sessions.</td></tr> : loading && !report ? <tr><td colSpan="9" className="finance-empty">Loading paid sessions…</td></tr> : report?.rows?.length ? report.rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.date}</strong><div className="finance-meta">{row.timeIn} – {row.timeOut}</div></td>
                    <td>{row.facilityName}<div className="finance-meta">{row.roomType}{row.unitNumber ? ` · Unit ${row.unitNumber}` : ''}</div></td>
                    <td>{row.guestName}</td>
                    <td>{row.source === 'booking' ? 'Reservation' : 'Walk-in'}</td>
                    <td className="finance-value">{row.duration}h</td>
                    <td>{row.rateLabel}</td>
                    <td className="finance-value">{money(row.amount)}</td>
                    <td className="finance-value">{money(row.collected)}</td>
                    <td><span className={`monitor-payment-pill ${String(row.paymentStatus).toLowerCase()}`}>{row.paymentStatus}</span><div className="finance-meta">{row.paymentTiming === 'After' ? 'Pay after play' : 'Collected before play'}</div></td>
                  </tr>
                )) : <tr><td colSpan="9" className="finance-empty">No paid sessions for these service dates.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="card monitor-room-totals">
          <div className="monitor-report-card-head"><div><h3>By room type</h3><p>Played hours and collections stay tied to each hourly rate.</p></div></div>
          <div className="monitor-room-total-list">
            {report?.byRoomType?.length ? report.byRoomType.map((group) => (
              <div key={`${group.facilityName}-${group.roomType}`}>
                <span><strong>{group.roomType}</strong><small>{group.facilityName} · {group.sessions} session{group.sessions === 1 ? '' : 's'} · {group.hours}h</small></span>
                <span><strong>{money(group.collected)}</strong><small>Paid in full</small></span>
              </div>
            )) : <p className="finance-empty">Room totals appear after a session is recorded.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default SessionReportPanel;
