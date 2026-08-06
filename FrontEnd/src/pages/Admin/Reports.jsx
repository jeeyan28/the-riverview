import '../../styles/admin/reports.css';
import '../../styles/admin/monitor.css';
import { useEffect, useMemo, useState } from 'react';
import DateRangePicker from '../../components/DateRangePicker';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { reportsService } from '../../services/reports';
import { roomSessionsService } from '../../services/monitoring';

const RECENT_FINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatPeso(amount) {
  return `₱${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Reports() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');
  const { confirm, confirmProps } = useConfirm();

  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [loadingSource, setLoadingSource] = useState(null);
  const [exportError, setExportError] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);
  const [editSessionId, setEditSessionId] = useState(null);

  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  async function fetchFinishedSessions() {
    setSessionsLoading(true);
    setSessionsError(false);
    try {
      const data = await roomSessionsService.list();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setSessionsError(true);
    } finally {
      setSessionsLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage) {
      setSessionsLoading(false);
      return;
    }
    fetchFinishedSessions();
  }, [canManage]);

  function handleRangeChange(nextFrom, nextTo) {
    setFrom(nextFrom);
    setTo(nextTo);
  }

  async function handleExport(source) {
    const label = source === 'booking' ? 'Bookings Report' : 'Room Monitoring Report';
    if (!(await confirm(`Export the ${label} for ${from} to ${to}? This will download an Excel file.`, { confirmText: 'Export' }))) return;
    setLoadingSource(source);
    setExportError(null);
    try {
      await reportsService.exportRange(from, to, source);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setLoadingSource(null);
    }
  }

  async function voidSession(session) {
    if (!guardPermission('room:manage')) return;
    if (!(await confirm('Void this session record? Its amount will be zeroed out and it will no longer count as a sale.', { confirmText: 'Void' }))) return;
    try {
      await roomSessionsService.editFinished(session._id, { amount: 0, paidAmount: 0, paymentStatus: 'Unpaid' });
      await fetchFinishedSessions();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not void this session.');
    }
  }

  async function saveSessionEdit(sessionId, payload) {
    await roomSessionsService.editFinished(sessionId, payload);
    setEditSessionId(null);
    await fetchFinishedSessions();
  }

  const recentlyFinished = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'Finished' && s.endedAt && Date.now() - new Date(s.endedAt).getTime() <= RECENT_FINISHED_WINDOW_MS)
        .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()),
    [sessions]
  );

  const summary = useMemo(() => {
    const totalSales = recentlyFinished.reduce((sum, s) => sum + (s.amount || 0), 0);
    const paidCount = recentlyFinished.filter((s) => (s.paymentStatus || 'Unpaid') === 'Paid').length;
    const unpaidCount = recentlyFinished.length - paidCount;
    return { totalSales, transactions: recentlyFinished.length, paidCount, unpaidCount };
  }, [recentlyFinished]);

  const visibleSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return recentlyFinished.filter((s) => {
      if (paymentFilter && (s.paymentStatus || 'Unpaid') !== paymentFilter) return false;
      if (!term) return true;
      const haystack = `${s.guestName || ''} ${s.room?.facilityName || s.facilityName || ''} ${s.room?.roomNumber ?? s.roomNumber ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [recentlyFinished, search, paymentFilter]);

  const columns = [
    {
      key: 'room',
      label: 'Room',
      render: (s) => (
        <>
          <div className="rm-name">Room {s.room?.roomNumber ?? s.roomNumber}</div>
          <div className="rm-type">{s.room?.facilityName || s.facilityName || ''}</div>
        </>
      ),
    },
    { key: 'guest', label: 'Guest', render: (s) => s.guestName || '—' },
    {
      key: 'ended',
      label: 'Ended',
      render: (s) => (s.endedAt ? new Date(s.endedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'),
    },
    { key: 'amount', label: 'Amount', render: (s) => formatPeso(s.amount) },
    {
      key: 'payment',
      label: 'Payment',
      render: (s) => <span className={`pay-pill pay-${(s.paymentStatus || 'Unpaid').toLowerCase()}`}>{s.paymentStatus || 'Unpaid'}</span>,
    },
    {
      key: 'actions',
      label: 'Action',
      render: (s) => (
        <div className="rm-actions rm-actions--table">
          <button className="rm-btn" onClick={() => setEditSessionId(s._id)}><i className="bi bi-pencil-square"></i>Edit</button>
          <button className="rm-btn danger" onClick={() => voidSession(s)}><i className="bi bi-x-circle"></i>Void</button>
        </div>
      ),
    },
  ];

  return (
    <div className="panel active" id="panel-reports">
      <div className="card">
        <div className="card-head">
          <span className="card-title">Export Sales Report</span>
        </div>
        <p className="rep-card-desc">Download an itemized Excel report for a chosen date range, split by booking or walk-in sales.</p>
        <div className="rep-daterange-row">
          <div className="field-stack">
            <label className="field-label">Date range</label>
            <DateRangePicker from={from} to={to} onChange={handleRangeChange} />
          </div>
          <button className="save-btn" onClick={() => handleExport('booking')} disabled={loadingSource !== null}>
            <i className="ti ti-calendar-check"></i>
            {loadingSource === 'booking' ? 'Generating…' : 'Export Bookings Report'}
          </button>
          <button className="save-btn" onClick={() => handleExport('walkin')} disabled={loadingSource !== null}>
            <i className="ti ti-door-enter"></i>
            {loadingSource === 'walkin' ? 'Generating…' : 'Export Room Monitoring Report'}
          </button>
        </div>
        {exportError && (
          <div className="rep-alert">
            <i className="ti ti-alert-triangle"></i>
            {exportError}
          </div>
        )}
      </div>

      {canManage && (
        <>
          <div className="metric-row rep-metric-row">
            <div className="mc">
              <div className="mc-label"><i className="ti ti-cash"></i>Sales (Last 24h)</div>
              <div className="mc-val">{sessionsLoading ? '—' : formatPeso(summary.totalSales)}</div>
              <div className="mc-sub">From finished sessions</div>
            </div>
            <div className="mc">
              <div className="mc-label"><i className="ti ti-receipt"></i>Transactions</div>
              <div className="mc-val">{sessionsLoading ? '—' : summary.transactions}</div>
              <div className="mc-sub">Sessions ended in last 24h</div>
            </div>
            <div className="mc">
              <div className="mc-label"><i className="ti ti-circle-check"></i>Paid</div>
              <div className="mc-val">{sessionsLoading ? '—' : summary.paidCount}</div>
              <div className="mc-sub up">Fully settled</div>
            </div>
            <div className="mc">
              <div className="mc-label"><i className="ti ti-circle-x"></i>Unpaid / Balance</div>
              <div className="mc-val">{sessionsLoading ? '—' : summary.unpaidCount}</div>
              <div className={`mc-sub ${summary.unpaidCount > 0 ? 'dn' : ''}`}>{summary.unpaidCount > 0 ? 'Needs follow-up' : 'All clear'}</div>
            </div>
          </div>

          <div className="card card-flush rep-log-card">
            <div className="rep-log-head">
              <span className="card-title">Recently Finished Sessions</span>
              <div className="rep-log-filters">
                <div className="rep-search">
                  <i className="ti ti-search"></i>
                  <input
                    type="text"
                    placeholder="Search guest, room, or facility…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="users-filter-input"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                >
                  <option value="">All payment status</option>
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
              </div>
            </div>

            <div className="rep-log-table-wrap">
              <DataTable
                columns={columns}
                rows={sessionsError ? [] : visibleSessions}
                loading={sessionsLoading}
                emptyMessage={sessionsError ? 'Failed to load sessions.' : recentlyFinished.length === 0 ? 'No sessions finished in the last 24 hours.' : 'No sessions match your search.'}
                getRowKey={(s) => s._id}
              />
            </div>
          </div>
        </>
      )}

      <EditFinishedSessionModal
        session={sessions.find((s) => s._id === editSessionId) || null}
        onClose={() => setEditSessionId(null)}
        onSubmit={saveSessionEdit}
      />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

function EditFinishedSessionModal({ session, onClose, onSubmit }) {
  const [guestName, setGuestName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('Unpaid');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    setGuestName(session.guestName || '');
    setAmount(String(session.amount ?? 0));
    setPaymentStatus(session.paymentStatus || 'Unpaid');
  }, [session]);

  async function handleSubmit() {
    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      alert('Amount must be a valid non-negative number.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(session._id, { amount: parsedAmount, guestName, paymentStatus });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save this correction.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!session} onClose={onClose} title="Edit Finished Session">
      {session && (
        <>
          <div className="mfield">
            <label>Guest Name</label>
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
          </div>
          <div className="mfield">
            <label>Amount (₱)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="mfield">
            <label>Payment Status</label>
            <div className="pay-toggle" role="group" aria-label="Payment status">
              <button
                type="button"
                className={`pay-toggle-btn pay-toggle-btn--paid${paymentStatus === 'Paid' ? ' active' : ''}`}
                onClick={() => setPaymentStatus('Paid')}
              >
                Paid
              </button>
              <button
                type="button"
                className={`pay-toggle-btn pay-toggle-btn--unpaid${paymentStatus === 'Unpaid' ? ' active' : ''}`}
                onClick={() => setPaymentStatus('Unpaid')}
              >
                Unpaid
              </button>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-confirm" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Reports;