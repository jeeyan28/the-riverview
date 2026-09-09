import '../../styles/admin/reports.css';
import '../../styles/admin/finance.css';
import { useMemo, useState } from 'react';
import RevenueFilters from '../../components/RevenueFilters';
import RevenueSummary from '../../components/RevenueSummary';
import { businessDate, daysBefore, useRevenueReport } from '../../hooks/useRevenueReport';
import { reportsService } from '../../services/reports';
import { formatPeso } from '../../utils/currency';

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusClass(status) {
  if (status === 'Cancelled' || status === 'Rejected' || status === 'No Show') return 'pill-overdue';
  if (status === 'Done' || status === 'Finished') return 'pill-done';
  if (status === 'Pending' || status === 'Partial' || status === 'Unpaid') return 'pill-pending';
  return 'pill-active';
}

function Reports() {
  const today = useMemo(() => businessDate(), []);
  const [from, setFrom] = useState(() => daysBefore(today, 6));
  const [to, setTo] = useState(today);
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const { data, loading, error, reload } = useRevenueReport(from, to, source);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data?.rows || [];
    return (data?.rows || []).filter((row) => [row.reference, row.guestName, row.facilityName, row.roomName, row.status, row.paymentStatus].join(' ').toLowerCase().includes(term));
  }, [data, search]);

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      await reportsService.exportRange(from, to, source);
    } catch (err) {
      setExportError(err.message || 'Could not generate the report.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="panel active" id="panel-reports">
      <RevenueFilters
        from={from}
        to={to}
        source={source}
        onRangeChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo); }}
        onSourceChange={setSource}
        reload={reload}
        loading={loading}
      >
        <button type="button" className="save-btn" onClick={handleExport} disabled={exporting || loading}>
          <i className="ti ti-file-spreadsheet" aria-hidden="true" /> {exporting ? 'Generating…' : 'Export Excel'}
        </button>
        <button type="button" className="btn-cancel" onClick={() => window.print()} disabled={!data || loading}>
          <i className="ti ti-file-type-pdf" aria-hidden="true" /> Print / Save PDF
        </button>
      </RevenueFilters>

      <div className="card no-print">
        <div className="card-head"><span className="card-title">Revenue and payment report</span><span className="finance-meta">{displayDate(from)} – {displayDate(to)}</span></div>
        <p className="rep-card-desc">Each charge stays tied to its facility, room type, hourly rate, and played or reserved hours. Linked reservations and sessions appear once.</p>
        {exportError && <div className="finance-error" role="alert">{exportError}</div>}
        {error && <div className="finance-error" role="alert">{error}</div>}
      </div>

      <p className="finance-basis">Report basis: recorded payments less manual refunds, grouped by service date in Asia/Manila. Transactions with incomplete legacy payment data are marked for review.</p>
      <RevenueSummary summary={data?.summary} loading={loading} />

      {data?.warnings?.length > 0 && (
        <div className="finance-warning" role="status"><strong>Payment review needed</strong><ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
      )}

      <div className="finance-activity">
        <span><strong>{data?.summary?.transactions ?? '—'}</strong> transactions</span>
        <span><strong>{data?.summary?.reservations ?? '—'}</strong> online reservations</span>
        <span><strong>{data?.summary?.walkins ?? '—'}</strong> walk-ins / manual bookings</span>
        <span><strong>{data?.summary?.bookedHours ?? '—'}h</strong> booked hours</span>
      </div>

      {data?.byFacility?.length > 0 && (
        <div className="report-room-types" aria-label="Revenue by room type">
          {data.byFacility.map((item) => <div key={item.name}><span><strong>{item.roomType || item.name}</strong><small>{item.facilityName || ''} · {item.bookedHours}h</small></span><span><strong>{formatPeso(item.collected)}</strong><small>{formatPeso(item.outstanding)} due</small></span></div>)}
        </div>
      )}

      <div className="card card-flush rep-log-card">
        <div className="rep-log-head no-print">
          <span className="card-title">Transactions</span>
          <div className="rep-log-filters">
            <div className="rep-search">
              <i className="ti ti-search" aria-hidden="true" />
              <input type="search" placeholder="Search reference, guest, or facility…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search transactions" />
            </div>
          </div>
        </div>
        <div className="rep-log-table-wrap">
          <div className="admin-table-scroll finance-screen-table" tabIndex={0} role="region" aria-label="Sales transactions table">
            <table className="tbl">
              <thead><tr><th>Date / time</th><th>Facility / room</th><th>Guest / source</th><th>Hours</th><th>Rate / hour</th><th>Charge</th><th>Paid</th><th>Balance</th><th>Payment / status</th></tr></thead>
              <tbody>
                {loading && !data ? <tr><td colSpan="9" className="finance-empty">Loading report…</td></tr> : visibleRows.length ? visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>{displayDate(row.date)}<div className="finance-meta">{row.timeIn || '—'}{row.timeOut ? ` – ${row.timeOut}` : ''} · {row.reference}</div></td>
                    <td>{row.facilityName}<div className="finance-meta">{row.roomType || row.roomName}{row.unitNumber ? ` · Unit ${row.unitNumber}` : ''}</div></td>
                    <td>{row.guestName}<div className="finance-meta">{row.source === 'booking' ? 'Reservation' : 'Walk-in'}</div></td>
                    <td className="finance-value">{row.duration}h</td>
                    <td>{row.rateLabel || formatPeso(row.rate)}</td>
                    <td className="finance-value">{formatPeso(row.amount)}</td>
                    <td className="finance-value">{formatPeso(row.collected)}</td>
                    <td className="finance-value">{formatPeso(row.balance)}</td>
                    <td><span className={`pill ${statusClass(row.paymentStatus)}`}>{row.paymentStatus}</span><div className="finance-meta">{row.status}</div></td>
                  </tr>
                )) : <tr><td colSpan="9" className="finance-empty">No transactions match this range.</td></tr>}
              </tbody>
            </table>
          </div>
          <table className="finance-print-table">
            <thead><tr><th>Date / time</th><th>Facility / room</th><th>Guest / source</th><th>Hours</th><th>Rate</th><th>Charge</th><th>Paid</th><th>Balance</th><th>Payment / status</th></tr></thead>
            <tbody>{visibleRows.map((row) => <tr key={`print-${row.id}`}><td>{displayDate(row.date)} {row.timeIn || ''} {row.timeOut ? `– ${row.timeOut}` : ''}<br />{row.reference}</td><td>{row.facilityName} {row.roomType || row.roomName || ''}</td><td>{row.guestName}<br />{row.source === 'booking' ? 'Reservation' : 'Walk-in'}</td><td>{row.duration}h</td><td>{row.rateLabel || formatPeso(row.rate)}</td><td>{formatPeso(row.amount)}</td><td>{formatPeso(row.collected)}</td><td>{formatPeso(row.balance)}</td><td>{row.paymentStatus} / {row.status}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Reports;
