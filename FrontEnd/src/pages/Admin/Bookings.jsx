import '../../styles/admin/bookings.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { dateKey } from '../../utils/rooms';
import { resolveImageUrl } from '../../utils/resolveImageUrl';
import { useAuth } from '../../context/AuthContext';
import { useSiteSettings } from '../../hooks/useSiteSettings';
import { roomsService } from '../../services/rooms';
import { bookingsService } from '../../services/bookings';



const STATUS_PILL_CLASS = {
  Active: 'pill-active',
  Pending: 'pill-pending',
  Done: 'pill-done',
  Overdue: 'pill-overdue',
  Cancelled: 'pill-done',
  'Pending Payment Verification': 'pill-pending',
  Confirmed: 'pill-active',
  Rejected: 'pill-overdue',
};
const PAYMENT_PILL_CLASS = {
  Unpaid: 'pill-done',
  'Pending Verification': 'pill-pending',
  Paid: 'pill-active',
  Rejected: 'pill-overdue',
};
const BOOKING_STATUSES = ['Pending Payment Verification', 'Confirmed', 'Rejected', 'Active', 'Pending', 'Done', 'Overdue', 'Cancelled'];
const PAYMENT_STATUSES = Object.keys(PAYMENT_PILL_CLASS);
const PAYMENT_METHODS = ['Cash', 'GCash', 'Maya'];
const SEARCH_DEBOUNCE_MS = 350;
const MAX_GUEST_HISTORY_ROWS = 5;
const SHORT_STATUS = { 'Pending Payment Verification': 'Pending' };
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shortStatusLabel(status) {
  return SHORT_STATUS[status] || status;
}

function shortBookingId(b) {
  const year = b.createdAt ? new Date(b.createdAt).getFullYear() : new Date().getFullYear();
  const tail = String(b._id || '').slice(-6).toUpperCase();
  return `#BK-${year}-${tail}`;
}

function facilityName(b) {
  return b.room?.name || b.roomLabel || '—';
}

function Bookings() {
  const { initializing, hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('booking:manage');
  const { confirm, confirmProps } = useConfirm();
  const { minDuration, maxDuration } = useSiteSettings();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const searchDebounce = useRef(null);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rooms, setRooms] = useState([]);

  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());

  const [detailId, setDetailId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [proofId, setProofId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fullHistory, setFullHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await roomsService.list();
        if (!cancelled) setRooms(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await bookingsService.list({
        search: search.trim(),
        status: statusFilter,
        paymentStatus: paymentFilter,
        room: roomFilter,
        date: dateFilter,
      });
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, paymentFilter, roomFilter, dateFilter]);

  useEffect(() => {
    fetchBookings();
  }, [statusFilter, paymentFilter, roomFilter, dateFilter]);

  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(fetchBookings, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  function openEditBooking(id) {
    if (!guardPermission('booking:manage')) return;
    setEditId(id);
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setPaymentFilter('');
    setRoomFilter('');
    setDateFilter('');
  }

  async function updateBookingStatus(id, status) {
    if (!guardPermission('booking:manage')) return;
    try {
      await bookingsService.update(id, { status });
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert('Could not update this booking.');
    }
  }

  async function deleteBooking(id) {
    if (!guardPermission('booking:manage')) return;
    if (!(await confirm('Permanently delete this booking? This cannot be undone.', { danger: true, confirmText: 'Delete' }))) return;
    try {
      await bookingsService.remove(id);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert('Could not delete this booking.');
    }
  }

  async function approveBooking(id) {
    if (!guardPermission('booking:manage')) return;
    try {
      await bookingsService.approve(id);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert('Could not approve this booking.');
    }
  }

  async function rejectBooking(id) {
    if (!guardPermission('booking:manage')) return;
    if (!(await confirm("Reject this payment? The customer's slot will not be held.", { danger: true, confirmText: 'Reject' }))) return;
    try {
      await bookingsService.reject(id);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert('Could not reject this booking.');
    }
  }

  async function openFullHistory() {
    if (!detailBooking) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const params = detailBooking.guestContact ? { guestContact: detailBooking.guestContact } : { guestName: detailBooking.guestName };
      const data = await bookingsService.list(params);
      const list = (Array.isArray(data) ? data : [])
        .filter((b) => b._id !== detailBooking._id)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setFullHistory(list);
    } catch (err) {
      console.error(err);
      setFullHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const stats = useMemo(
    () => ({
      total: bookings.length,
      pendingPayments: bookings.filter((b) => ['Unpaid', 'Pending Verification'].includes(b.paymentStatus)).length,
      activeGuests: bookings.filter((b) => b.status === 'Active').length,
      cancelled: bookings.filter((b) => b.status === 'Cancelled').length,
    }),
    [bookings]
  );

  const detailBooking = useMemo(() => bookings.find((b) => b._id === detailId) || null, [bookings, detailId]);
  const editBooking = useMemo(() => bookings.find((b) => b._id === editId) || null, [bookings, editId]);
  const proofBooking = useMemo(() => bookings.find((b) => b._id === proofId) || null, [bookings, proofId]);

  const historyForDetail = useMemo(() => {
    if (!detailBooking) return [];
    return bookings
      .filter(
        (b) =>
          b._id !== detailBooking._id &&
          (detailBooking.guestContact ? b.guestContact === detailBooking.guestContact : b.guestName === detailBooking.guestName)
      )
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, MAX_GUEST_HISTORY_ROWS);
  }, [bookings, detailBooking]);

  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      if (!b.date) return;
      (map[b.date] = map[b.date] || []).push(b);
    });
    return map;
  }, [bookings]);

  const calendarCells = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(year, month, d);
      cells.push({ day: d, key, isToday: key === todayKey, count: (bookingsByDate[key] || []).length });
    }
    return cells;
  }, [calendarViewDate, bookingsByDate]);

  const monthLabel = calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function changeMonth(delta) {
    setCalendarViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  const columns = [
    { key: 'reservationCode', label: 'Reservation Code', render: (b) => b.reservationCode || shortBookingId(b) },
    { key: 'guestName', label: 'Customer' },
    { key: 'guestContact', label: 'Phone', render: (b) => b.guestContact || '—' },
    { key: 'roomLabel', label: 'Facility Name', render: (b) => facilityName(b) },
    { key: 'variantLabel', label: 'Room', render: (b) => b.variantLabel || 'Standard' },
    { key: 'date', label: 'Booking Date' },
    { key: 'timeIn', label: 'Time' },
    { key: 'duration', label: 'Hours', render: (b) => `${b.duration}h` },
    {
      key: 'paymentStatus',
      label: 'Payment',
      render: (b) =>
        b.paymentScreenshot ? (
          <span
            className={`pill ${PAYMENT_PILL_CLASS[b.paymentStatus] || 'pill-pending'}`}
            style={{ cursor: 'pointer' }}
            title="Click to view screenshot"
            onClick={() => setProofId(b._id)}
          >
            {b.paymentStatus}
          </span>
        ) : (
          <span className={`pill ${PAYMENT_PILL_CLASS[b.paymentStatus] || 'pill-pending'}`}>{b.paymentStatus}</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (b) => <span className={`pill ${STATUS_PILL_CLASS[b.status] || 'pill-pending'}`}>{b.status}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (b) => {
        const isPendingVerification = b.status === 'Pending Payment Verification';
        return (
          <div className="d-flex gap-2 flex-wrap">
            <button className="tbl-action-btn" style={{ color: 'var(--text)' }} onClick={() => setDetailId(b._id)}>
              View
            </button>
            {canManage && (
              <>
                {isPendingVerification && (
                  <>
                    <button className="tbl-action-btn" style={{ color: 'var(--teal)' }} onClick={() => approveBooking(b._id)}>
                      Approve
                    </button>
                    <button className="tbl-action-btn" style={{ color: 'var(--red)' }} onClick={() => rejectBooking(b._id)}>
                      Reject
                    </button>
                  </>
                )}
                {!isPendingVerification && b.status === 'Overdue' && (
                  <button className="tbl-action-btn" style={{ color: 'var(--red)' }} onClick={() => updateBookingStatus(b._id, 'Done')}>
                    Resolve
                  </button>
                )}
                {!isPendingVerification && b.status !== 'Overdue' && !['Done', 'Cancelled', 'Rejected'].includes(b.status) && (
                  <button className="tbl-action-btn" style={{ color: 'var(--teal)' }} onClick={() => updateBookingStatus(b._id, 'Done')}>
                    Mark Done
                  </button>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="panel active" id="panel-bookings">
      <div className="metric-row">
        <div className="mc">
          <div className="mc-label"><i className="ti ti-calendar-stats"></i> Total Reservations</div>
          <div className="mc-val">{stats.total.toLocaleString()}</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-credit-card"></i> Pending Payments</div>
          <div className="mc-val">{stats.pendingPayments.toLocaleString()}</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-users"></i> Active Guests</div>
          <div className="mc-val">{stats.activeGuests.toLocaleString()}</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-circle-x"></i> Cancelled</div>
          <div className="mc-val">{stats.cancelled.toLocaleString()}</div>
        </div>
      </div>

      <div className="bk-toolbar">
        <div className="bk-filters">
          <input
            type="text"
            className="bk-filter-input"
            placeholder="Search name, phone, or reservation code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="bk-filter-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="bk-filter-input" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
            <option value="">All Payment Status</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="bk-filter-input" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
            <option value="">All Facilities</option>
            {rooms.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="bk-filter-input"
            title="Filter by exact date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
          <button type="button" className="bk-clear-btn" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>


      <div className="card card-flush">
        <DataTable
          columns={columns}
          rows={bookings}
          loading={loading}
          emptyMessage={loadError ? 'Could not load bookings.' : 'No bookings match your filters.'}
          getRowKey={(b) => b._id}
        />
      </div>

      <EditBookingModal booking={editBooking} onClose={() => setEditId(null)} onSaved={fetchBookings} minDuration={minDuration} maxDuration={maxDuration} />

      <Modal open={!!proofBooking} onClose={() => setProofId(null)} title="Payment Screenshot">
        {proofBooking && (
          <>
            <div style={{ textAlign: 'center' }}>
              <img
                src={resolveImageUrl(proofBooking.paymentScreenshot)}
                alt="Payment screenshot"
                style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 10 }}
              />
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 10 }}>
                {proofBooking.guestName} · {facilityName(proofBooking)} · ₱{(proofBooking.downPayment || 0).toLocaleString()} down payment via {proofBooking.paymentMethod}
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setProofId(null)}>Close</button>
              {proofBooking.status === 'Pending Payment Verification' && (
                <>
                  <button
                    className="btn-cancel"
                    style={{ color: 'var(--red)', borderColor: 'rgba(225,29,72,.3)' }}
                    onClick={async () => { await rejectBooking(proofBooking._id); setProofId(null); }}
                  >
                    Reject
                  </button>
                  <button
                    className="btn-confirm"
                    onClick={async () => { await approveBooking(proofBooking._id); setProofId(null); }}
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!detailBooking} onClose={() => setDetailId(null)} size="xl">
        {detailBooking && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="modal-lg-title">Booking Details</div>
                <p className="modal-lg-sub" style={{ marginBottom: 0 }}>Reservation Code: {detailBooking.reservationCode || shortBookingId(detailBooking)}</p>
              </div>
              <span className={`pill ${STATUS_PILL_CLASS[detailBooking.status] || 'pill-pending'}`}>
                {shortStatusLabel(detailBooking.status)}
              </span>
            </div>

            <div className="bd-section two-col">
              <div>
                <div className="bd-section-title"><i className="ti ti-user"></i> Customer Information</div>
                <div className="bd-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="bd-field"><label>Customer Name</label><p>{detailBooking.guestName || '—'}</p></div>
                  <div className="bd-field">
                    <label>Email</label>
                    <p>{detailBooking.guestEmail || (String(detailBooking.guestContact || '').includes('@') ? detailBooking.guestContact : '—')}</p>
                  </div>
                  <div className="bd-field">
                    <label>Phone Number</label>
                    <p>{detailBooking.guestContact && !String(detailBooking.guestContact).includes('@') ? detailBooking.guestContact : detailBooking.guestContact || '—'}</p>
                  </div>
                  <div className="bd-field"><label>Number of Guests</label><p>{detailBooking.guestCount ? String(detailBooking.guestCount) : '—'}</p></div>
                </div>
              </div>

              <div>
                <div className="bd-section-title"><i className="ti ti-credit-card"></i> Payment Breakdown</div>
                <div className="bd-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="bd-field"><label>Downpayment</label><p>₱{Number(detailBooking.downPayment || 0).toLocaleString()}</p></div>
                  <div className="bd-field"><label>Remaining Balance</label><p>₱{Number((detailBooking.amount || 0) - (detailBooking.downPayment || 0)).toLocaleString()}</p></div>
                  <div className="bd-field"><label>Total Amount</label><p>₱{Number(detailBooking.amount || 0).toLocaleString()}</p></div>
                  <div className="bd-field"><label>Payment Method</label><p>{detailBooking.paymentMethod || '—'}</p></div>
                </div>
              </div>
            </div>

            <div className="bd-section two-col">
              <div>
                <div className="bd-section-title"><i className="ti ti-calendar-event"></i> Booking Specifications</div>
                <div className="bd-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="bd-field"><label>Facility Name</label><p>{facilityName(detailBooking)}</p></div>
                  <div className="bd-field"><label>Room</label><p>{detailBooking.variantLabel || '—'}</p></div>
                  <div className="bd-field"><label>Booking Date</label><p>{detailBooking.date || '—'}</p></div>
                  <div className="bd-field"><label>Check-in Time</label><p>{detailBooking.timeIn || '—'}</p></div>
                  <div className="bd-field"><label>Duration</label><p>{detailBooking.duration ? `${detailBooking.duration} hr${detailBooking.duration > 1 ? 's' : ''}` : '—'}</p></div>
                  <div className="bd-field"><label>Booked On</label><p>{detailBooking.createdAt ? new Date(detailBooking.createdAt).toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</p></div>
                </div>
              </div>

              <div>
                <div className="bd-section-title"><i className="ti ti-history"></i> Customer Booking History</div>
                <div className="card card-flush">
                  <table className="tbl">
                    <thead style={{ background: 'var(--navy3)' }}>
                      <tr><th style={{ padding: '8px 10px' }}>Date</th><th>Room</th><th>Hrs</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {historyForDetail.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '10px 0', fontSize: '.8rem' }}>No previous bookings from this guest.</td></tr>
                      ) : (
                        historyForDetail.map((h) => (
                          <tr key={h._id}>
                            <td style={{ padding: '8px 10px' }}>{h.date}</td>
                            <td>{facilityName(h)}</td>
                            <td>{h.duration}hrs</td>
                            <td><span className={`pill ${STATUS_PILL_CLASS[h.status] || 'pill-pending'}`}>{shortStatusLabel(h.status)}</span></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {historyForDetail.length > 0 && (
                  <button
                    type="button"
                    className="tbl-action-btn"
                    style={{ color: 'var(--text)', marginTop: 6 }}
                    onClick={openFullHistory}
                  >
                    View All History
                  </button>
                )}
              </div>
            </div>

            {detailBooking.paymentScreenshot && (
              <div className="bd-section">
                <div className="bd-section-title"><i className="ti ti-receipt"></i> Payment Screenshot</div>
                <img
                  className="bd-screenshot"
                  src={resolveImageUrl(detailBooking.paymentScreenshot)}
                  alt="Payment screenshot sent by the guest"
                  onClick={() => setProofId(detailBooking._id)}
                  style={{ cursor: 'pointer' }}
                />
                <p className="bd-screenshot-hint">Click to view full size, approve, or reject.</p>
              </div>
            )}

            {detailBooking.paymentProvider === 'paymongo' && (
              <div className="bd-section">
                <div className="bd-section-title"><i className="ti ti-credit-card"></i> Payment</div>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: 0 }}>
                  Paid automatically online via PayMongo — confirmed and verified directly, no screenshot or manual approval needed.
                </p>
              </div>
            )}

            <div className="bd-section">
              <div className="bd-section-title"><i className="ti ti-file-text"></i> Special Requests / Notes</div>
              <p className="bd-notes-body">{detailBooking.specialRequests?.trim() || 'No special requests provided.'}</p>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {canManage && (
                  <button
                    className="btn-cancel"
                    onClick={() => { const id = detailBooking._id; setDetailId(null); openEditBooking(id); }}
                  >
                    Edit Booking
                  </button>
                )}
                {canManage && (
                  <button
                    className="btn-cancel"
                    style={{ color: 'var(--red)', borderColor: 'rgba(225,29,72,.3)' }}
                    onClick={async () => { const id = detailBooking._id; setDetailId(null); await deleteBooking(id); }}
                  >
                    Delete
                  </button>
                )}
                {canManage && !['Cancelled', 'Rejected', 'Done'].includes(detailBooking.status) && (
                  <button
                    className="btn-cancel"
                    style={{ color: 'var(--amber)', borderColor: 'rgba(245,165,36,.35)' }}
                    onClick={async () => {
                      if (!(await confirm('Cancel this booking? The guest will need to rebook if they still want the slot.', { danger: true, confirmText: 'Cancel Booking' }))) return;
                      await updateBookingStatus(detailBooking._id, 'Cancelled');
                      setDetailId(null);
                    }}
                  >
                    Cancel Booking
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-cancel" onClick={() => setDetailId(null)}>Close</button>
                {canManage && ['Pending', 'Pending Payment Verification'].includes(detailBooking.status) && (
                  <button
                    className="btn-cancel"
                    style={{ color: 'var(--red)', borderColor: 'rgba(225,29,72,.3)' }}
                    onClick={async () => {
                      if (detailBooking.status === 'Pending Payment Verification') {
                        await rejectBooking(detailBooking._id);
                      } else {
                        await updateBookingStatus(detailBooking._id, 'Rejected');
                      }
                      setDetailId(null);
                    }}
                  >
                    Deny
                  </button>
                )}
                {canManage && ['Pending', 'Pending Payment Verification'].includes(detailBooking.status) && (
                  <button
                    className="btn-confirm"
                    onClick={async () => {
                      if (detailBooking.status === 'Pending Payment Verification') {
                        await approveBooking(detailBooking._id);
                      } else {
                        await updateBookingStatus(detailBooking._id, 'Confirmed');
                      }
                      setDetailId(null);
                    }}
                  >
                    Confirm Booking
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Booking History — ${detailBooking?.guestName || ''}`}>
        <div className="card card-flush">
          <table className="tbl">
            <thead style={{ background: 'var(--navy3)' }}>
              <tr><th style={{ padding: '8px 10px' }}>Date</th><th>Room</th><th>Hrs</th><th>Status</th></tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '10px 0', fontSize: '.8rem' }}>Loading…</td></tr>
              ) : fullHistory.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '10px 0', fontSize: '.8rem' }}>No previous bookings from this guest.</td></tr>
              ) : (
                fullHistory.map((h) => (
                  <tr key={h._id}>
                    <td style={{ padding: '8px 10px' }}>{h.date}</td>
                    <td>{facilityName(h)}</td>
                    <td>{h.duration}hrs</td>
                    <td><span className={`pill ${STATUS_PILL_CLASS[h.status] || 'pill-pending'}`}>{shortStatusLabel(h.status)}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={() => setHistoryOpen(false)}>Close</button>
        </div>
      </Modal>

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

function EditBookingModal({ booking, onClose, onSaved, minDuration, maxDuration }) {
  const { guardPermission } = useAuth();
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [date, setDate] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [duration, setDuration] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [downPayment, setDownPayment] = useState(0);
  const [amount, setAmount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState('Unpaid');
  const [status, setStatus] = useState('Pending');
  const [specialRequests, setSpecialRequests] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (booking) {
      setGuestName(booking.guestName || '');
      setGuestEmail(booking.guestEmail || '');
      setGuestContact(booking.guestContact || '');
      setGuestCount(booking.guestCount ?? '');
      setDate(booking.date || '');
      setTimeIn(booking.timeIn || '');
      setDuration(booking.duration || 1);
      setPaymentMethod(booking.paymentMethod || 'Cash');
      setDownPayment(booking.downPayment || 0);
      setAmount(booking.amount || 0);
      setPaymentStatus(booking.paymentStatus || 'Unpaid');
      setStatus(booking.status || 'Pending');
      setSpecialRequests(booking.specialRequests || '');
    }
  }, [booking]);

  async function handleSave() {
    if (!guardPermission('booking:manage')) return;
    if (!guestName.trim()) {
      alert('Guest name is required.');
      return;
    }
    const d = Number(duration);
    if (!Number.isFinite(d) || d < minDuration || d > maxDuration) {
      alert(`Duration must be between ${minDuration} and ${maxDuration} hours.`);
      return;
    }
    setSaving(true);
    try {
      await bookingsService.update(booking._id, {
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestContact: guestContact.trim(),
        guestCount: guestCount === '' ? undefined : Number(guestCount),
        date,
        timeIn,
        duration: d,
        paymentMethod,
        downPayment: Number(downPayment) || 0,
        amount: Number(amount) || 0,
        paymentStatus,
        status,
        specialRequests: specialRequests.trim(),
      });
      onClose();
      await onSaved();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save changes to this booking.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!booking} onClose={onClose} size="xl">
      {booking && (
        <>
          <div className="modal-lg-title">Edit Booking</div>
          <p className="modal-lg-sub" style={{ marginBottom: 0 }}>
            {booking.reservationCode || shortBookingId(booking)} · {facilityName(booking)}
            {booking.variantLabel ? ` (${booking.variantLabel})` : ''}
          </p>

          <div className="bd-section two-col">
            <div>
              <div className="bd-section-title"><i className="ti ti-user"></i> Customer Information</div>
              <div className="mfield">
                <label>Guest name</label>
                <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Email</label>
                <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Phone number</label>
                <input type="text" value={guestContact} onChange={(e) => setGuestContact(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Number of guests</label>
                <input type="number" min="1" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
              </div>
            </div>

            <div>
              <div className="bd-section-title"><i className="ti ti-credit-card"></i> Payment</div>
              <div className="mfield">
                <label>Payment method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="mfield">
                <label>Downpayment (₱)</label>
                <input type="number" min="0" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Total amount (₱)</label>
                <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Payment status</label>
                <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bd-section two-col">
            <div>
              <div className="bd-section-title"><i className="ti ti-calendar-event"></i> Booking Specifications</div>
              <div className="mfield">
                <label>Facility Name</label>
                <p style={{ fontSize: '.85rem', color: 'var(--text)', margin: '2px 0 0' }}>{facilityName(booking)}</p>
              </div>
              <div className="mfield">
                <label>Room</label>
                <p style={{ fontSize: '.85rem', color: 'var(--text)', margin: '2px 0 0' }}>{booking.variantLabel || '—'}</p>
              </div>
              <div className="mfield">
                <label>Booking Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Check-in time</label>
                <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
              </div>
              <div className="mfield">
                <label>Duration (hours)</label>
                <input
                  type="number"
                  min={minDuration}
                  max={maxDuration}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="bd-section-title"><i className="ti ti-shield-check"></i> Status</div>
              <div className="mfield">
                <label>Booking status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bd-section">
            <div className="bd-section-title"><i className="ti ti-file-text"></i> Special Requests / Notes</div>
            <textarea
              rows={3}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              style={{
                width: '100%', background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical',
              }}
            />
          </div>

          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-confirm" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Bookings;