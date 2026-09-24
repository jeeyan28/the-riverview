import '../../styles/admin/bookings.css';
import '../../styles/admin/finance.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ReservationTimePicker, { reservationSelectionKey } from '../../components/ReservationTimePicker';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { dateKey } from '../../utils/rooms';
import { resolveImageUrl } from '../../utils/resolveImageUrl';
import { formatPeso } from '../../utils/currency';
import { guestPhoneDisplay } from '../../utils/receipt';
import { businessDate } from '../../utils/businessDate';
import { cancellationAmounts } from '../../utils/cancellationPolicy';
import { useAuth } from '../../context/AuthContext';
import { useSiteSettings } from '../../hooks/useSiteSettings';
import { roomsService } from '../../services/rooms';
import { bookingsService } from '../../services/bookings';
import { CORKAGE_FEE, calculateBookingPrice } from '../../utils/roomPricing';
import { RESERVATION_STATUS_FILTERS, reservationPresentation, reservationWindow } from '../../utils/reservationStatus';



const STATUS_PILL_CLASS = {
  Pending: 'pill-pending',
  Done: 'pill-done',
  Cancelled: 'pill-done',
  'No Show': 'pill-overdue',
  Confirmed: 'pill-active',
  Overdue: 'pill-overdue',
  Ongoing: 'pill-active',
  Rejected: 'pill-overdue',
};
const PAYMENT_METHODS = ['Cash', 'GCash', 'Maya', 'QR Ph', 'Credit / Debit Card'];
const SEARCH_DEBOUNCE_MS = 350;
const BOOKINGS_POLL_MS = 15000;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ReservationStatus({ booking, now }) {
  const { status, warning } = reservationPresentation(booking, now);
  return (
    <span className="bk-status-cell">
      <span className={`pill ${STATUS_PILL_CLASS[status] || 'pill-pending'}`}>{status}</span>
      {warning && <span className={`bk-status-note${warning === 'Overdue' ? ' bk-status-note--overdue' : ''}`}>{warning}</span>}
    </span>
  );
}

function shortBookingId(b) {
  const year = b.createdAt ? new Date(b.createdAt).getFullYear() : new Date().getFullYear();
  const tail = String(b._id || '').slice(-6).toUpperCase();
  return `#BK-${year}-${tail}`;
}

function facilityName(b) {
  return b.room?.name || b.roomLabel || '—';
}

function recordedPayment(b) {
  return Math.max(Number(b?.paidAmount) || 0, Number(b?.downPayment) || 0);
}

function netCollected(b) {
  return Math.max(0, recordedPayment(b) - (Number(b?.refundedAmount) || 0));
}

function outstandingBalance(b) {
  if (['Cancelled', 'Rejected', 'No Show'].includes(reservationPresentation(b).status)) return 0;
  return Math.max(0, Number(b?.amount || 0) - netCollected(b));
}

function isFullPayment(b) {
  return !['Cancelled', 'Rejected', 'No Show'].includes(reservationPresentation(b).status)
    && Number(b?.amount || 0) > 0 && netCollected(b) >= Number(b.amount);
}

function paymentPlanLabel(b) {
  const paid = netCollected(b);
  const balance = outstandingBalance(b);
  const refunded = Number(b?.refundedAmount) || 0;
  const cancellation = cancellationAmounts(b);
  if (b?.status === 'Cancelled' && b?.cancellationStatus === 'Approved' && cancellation.customerCancelled && cancellation.refundRemaining > 0) {
    return `${formatPeso(paid)} retained · ${formatPeso(cancellation.refundRemaining)} refund to arrange`;
  }
  if (refunded > 0) return `${formatPeso(refunded)} refunded · ${formatPeso(paid)} retained`;
  if (['Cancelled', 'Rejected', 'No Show'].includes(reservationPresentation(b).status)) return paid > 0 ? `${formatPeso(paid)} retained` : 'No payment retained';
  if (isFullPayment(b)) return `Paid ${formatPeso(paid)}`;
  if (paid > 0) return `${formatPeso(paid)} paid · ${formatPeso(balance)} remaining`;
  return `${formatPeso(balance)} remaining`;
}

function paymentPlanPillClass(b) {
  return isFullPayment(b) ? 'pill-active' : 'pill-pending';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

function Bookings() {
  const { initializing, hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('booking:manage');
  const { confirm, confirmProps } = useConfirm();
  const { minDuration, maxDuration } = useSiteSettings();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('status');
    return RESERVATION_STATUS_FILTERS.includes(requested) ? requested : '';
  });
  const [cancellationFilter, setCancellationFilter] = useState(() => new URLSearchParams(window.location.search).get('cancellationStatus') || '');
  const [roomFilter, setRoomFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => new URLSearchParams(window.location.search).get('from') || new URLSearchParams(window.location.search).get('date') || '');
  const [dateTo, setDateTo] = useState(() => new URLSearchParams(window.location.search).get('to') || new URLSearchParams(window.location.search).get('date') || '');
  const searchDebounce = useRef(null);

  const [allBookings, setBookings] = useState([]);
  const [clockMs, setClockMs] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rooms, setRooms] = useState([]);

  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());

  const [detailId, setDetailId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [proofId, setProofId] = useState(null);
  const [cancellationReviewId, setCancellationReviewId] = useState(null);
  const [manualBookingOpen, setManualBookingOpen] = useState(() => new URLSearchParams(window.location.search).get('openManualBooking') === '1');

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

  const fetchBookings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const data = await bookingsService.list({
        search: search.trim(),
        cancellationStatus: cancellationFilter,
        room: roomFilter,
        from: dateFrom,
        to: dateTo,
      });
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [search, cancellationFilter, roomFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchBookings();
  }, [cancellationFilter, roomFilter, dateFrom, dateTo]);

  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(fetchBookings, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  useEffect(() => {
    const handle = setInterval(() => fetchBookings({ silent: true }), BOOKINGS_POLL_MS);
    return () => clearInterval(handle);
  }, [fetchBookings]);

  useEffect(() => {
    let handle;
    function scheduleNextMinute() {
      handle = setTimeout(() => {
        setClockMs(Date.now());
        scheduleNextMinute();
      }, 60_000 - (Date.now() % 60_000) + 25);
    }
    function refreshVisibleClock() {
      if (!document.hidden) setClockMs(Date.now());
    }
    scheduleNextMinute();
    document.addEventListener('visibilitychange', refreshVisibleClock);
    return () => {
      clearTimeout(handle);
      document.removeEventListener('visibilitychange', refreshVisibleClock);
    };
  }, []);

  const bookings = useMemo(() => statusFilter
    ? allBookings.filter((booking) => reservationPresentation(booking, clockMs).status === statusFilter)
    : allBookings, [allBookings, statusFilter, clockMs]);

  function openEditBooking(id) {
    if (!guardPermission('booking:manage')) return;
    setEditId(id);
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setCancellationFilter('');
    setRoomFilter('');
    setDateFrom('');
    setDateTo('');
  }

  async function updateBookingStatus(id, status) {
    if (!guardPermission('booking:manage')) return;
    try {
      await bookingsService.update(id, { status });
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not update this reservation.');
    }
  }

  async function markBookingDone(booking) {
    if (!guardPermission('booking:manage')) return;
    const wasNoShow = reservationPresentation(booking, clockMs).status === 'No Show';
    const message = wasNoShow
      ? 'Mark this no-show as done? Use this only if the guest actually used the facility.'
      : 'Mark this reservation as done? Use this only if the guest used the facility without a Room Monitor session.';
    if (!(await confirm(message, { confirmText: 'Mark Done' }))) return;
    try {
      await bookingsService.markDone(booking._id);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not mark this reservation done.');
    }
  }

  async function deleteBooking(id) {
    if (!guardPermission('booking:manage')) return;
    if (!(await confirm('Permanently delete this reservation? This cannot be undone.', { danger: true, confirmText: 'Delete' }))) return;
    try {
      await bookingsService.remove(id);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert('Could not delete this reservation.');
    }
  }

  async function approveBooking(id) {
    if (!guardPermission('booking:manage')) return;
    try {
      await bookingsService.approve(id);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert('Could not approve this reservation.');
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
      alert('Could not reject this reservation.');
    }
  }

  async function reviewCancellation(id, payload) {
    if (!guardPermission('booking:manage')) return;
    try {
      await bookingsService.reviewCancellation(id, payload);
      setCancellationReviewId(null);
      setDetailId(null);
      await fetchBookings();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not review this cancellation.');
    }
  }

  const stats = useMemo(
    () => ({
      total: bookings.length,
      pendingPayments: bookings.filter((b) => ['Pending', 'Pending Payment Verification', 'Awaiting Online Payment'].includes(b.status)).length,
      activeGuests: bookings.filter((b) => b.status === 'Ongoing').length,
      cancelled: bookings.filter((b) => b.status === 'Cancelled').length,
    }),
    [bookings]
  );

  const detailBooking = useMemo(() => allBookings.find((b) => b._id === detailId) || null, [allBookings, detailId]);
  const editBooking = useMemo(() => allBookings.find((b) => b._id === editId) || null, [allBookings, editId]);
  const proofBooking = useMemo(() => allBookings.find((b) => b._id === proofId) || null, [allBookings, proofId]);
  const cancellationReviewBooking = useMemo(() => allBookings.find((b) => b._id === cancellationReviewId) || null, [allBookings, cancellationReviewId]);


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
    const todayKey = businessDate();

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
    {
      key: 'reservationCode',
      label: 'Reservation',
      sortable: true,
      sortValue: (b) => b.reservationCode || shortBookingId(b),
      render: (b) => <span className="bk-code">{b.reservationCode || shortBookingId(b)}</span>,
    },
    {
      key: 'guestName',
      label: 'Customer',
      sortable: true,
      render: (b) => (
        <div className="bk-customer">
          <span className="bk-avatar">{initials(b.guestName)}</span>
          <div className="bk-customer-info">
            <span className="bk-customer-name">{b.guestName || '—'}</span>
            <span className="bk-customer-phone">{guestPhoneDisplay(b.guestContact)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'roomLabel',
      label: 'Facility',
      sortable: true,
      sortValue: (b) => facilityName(b),
      render: (b) => (
        <div className="bk-facility">
          <span>{facilityName(b)}</span>
          <span className="bk-facility-room">{b.variantLabel || 'Standard'}</span>
        </div>
      ),
    },
    {
      key: 'date',
      label: 'Schedule',
      sortable: true,
      render: (b) => (
        <div className="bk-schedule">
          <span>{formatDate(b.date)}</span>
          <span className="bk-facility-room">{formatTime(b.timeIn)} · {b.duration}h</span>
        </div>
      ),
    },
    {
      key: 'paymentStatus',
      label: 'Payment',
      sortable: true,
      sortValue: (b) => recordedPayment(b),
      render: (b) =>
        b.paymentScreenshot ? (
          <button
            type="button"
            className={`pill bk-payment-pill ${paymentPlanPillClass(b)}`}
            title="Click to view screenshot"
            onClick={() => setProofId(b._id)}
          >
            {paymentPlanLabel(b)}
          </button>
        ) : (
          <span className={`pill bk-payment-pill ${paymentPlanPillClass(b)}`}>{paymentPlanLabel(b)}</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (b) => reservationPresentation(b, clockMs).status,
      render: (b) => <ReservationStatus booking={b} now={clockMs} />,
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
                {reservationPresentation(b, clockMs).status === 'No Show' && (
                  <button className="tbl-action-btn" style={{ color: 'var(--teal)' }} onClick={() => markBookingDone(b)}>
                    Done
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

      <div className="card bk-toolbar-card">
        <div className="bk-toolbar">
          <div className="bk-search-wrap">
            <i className="ti ti-search bk-search-icon" aria-hidden="true"></i>
            <input
              type="text"
              className="bk-filter-input bk-search-input"
              aria-label="Search reservations"
              placeholder="Search name, phone, or reservation code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="bk-filters">
            <select className="bk-filter-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Reservation status filter">
              <option value="">All Status</option>
              {RESERVATION_STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="bk-filter-input" value={cancellationFilter} onChange={(e) => setCancellationFilter(e.target.value)} aria-label="Cancellation review filter">
              <option value="">All cancellation states</option>
              <option value="Requested">Needs cancellation review</option>
              <option value="Approved">Cancellation approved</option>
              <option value="Rejected">Cancellation rejected</option>
            </select>
            <select className="bk-filter-input" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
              <option value="">All Facilities</option>
              {rooms.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="bk-date-range" role="group" aria-label="Reservation date range">
              <input
                type="date"
                className="bk-filter-input"
                aria-label="Reservations from date"
                title="Reservations from date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <span aria-hidden="true">to</span>
              <input
                type="date"
                className="bk-filter-input"
                aria-label="Reservations to date"
                title="Reservations to date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
            {(search || statusFilter || cancellationFilter || roomFilter || dateFrom || dateTo) && (
              <button type="button" className="bk-clear-btn" onClick={clearFilters}>
                <i className="ti ti-x"></i> Clear
              </button>
            )}
            {canManage && <button type="button" className="save-btn" onClick={() => setManualBookingOpen(true)}><i className="ti ti-plus" aria-hidden="true" /> Add manual reservation</button>}
          </div>
        </div>
        <div className="bk-results-row">
          {loading ? 'Loading reservations…' : `${bookings.length.toLocaleString()} reservation${bookings.length === 1 ? '' : 's'} found`}
        </div>
      </div>

      <div className="card card-flush">
        <DataTable
          columns={columns}
          rows={bookings}
          loading={loading}
          emptyMessage={loadError ? 'Could not load reservations.' : 'No reservations match your filters.'}
          getRowKey={(b) => b._id}
        />
      </div>

      <EditBookingModal booking={editBooking} rooms={rooms} onClose={() => setEditId(null)} onSaved={fetchBookings} minDuration={minDuration} maxDuration={maxDuration} />
      <CreateBookingModal open={manualBookingOpen} rooms={rooms} onClose={() => setManualBookingOpen(false)} onCreated={fetchBookings} minDuration={minDuration} maxDuration={maxDuration} />

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
                {proofBooking.guestName} · {facilityName(proofBooking)} · {formatPeso(proofBooking.downPayment)} down payment via {proofBooking.paymentMethod}
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

      <Modal open={!!detailBooking} onClose={() => setDetailId(null)} size="2xl">
        {detailBooking && (
          <>
            <div className="bd-header">
              <div>
                <div className="modal-lg-title">Reservation Details</div>
                <p className="modal-lg-sub" style={{ marginBottom: 0 }}>Reservation Code: {detailBooking.reservationCode || shortBookingId(detailBooking)}</p>
              </div>
              <ReservationStatus booking={detailBooking} now={clockMs} />
            </div>

            <div className="bd-body">
              <div className="bd-row">
                <div className="bd-card">
                  <div className="bd-section-title"><i className="ti ti-user"></i> Customer Information</div>
                  <div className="bd-grid">
                    <div className="bd-field"><label>Customer Name</label><p>{detailBooking.guestName || '—'}</p></div>
                    <div className="bd-field">
                      <label>Email</label>
                      <p>{detailBooking.guestEmail || (String(detailBooking.guestContact || '').includes('@') ? detailBooking.guestContact : '—')}</p>
                    </div>
                    <div className="bd-field">
                      <label>Phone Number</label>
                      <p>{guestPhoneDisplay(detailBooking.guestContact)}</p>
                    </div>
                    <div className="bd-field"><label>Number of Guests</label><p>{detailBooking.guestCount ? String(detailBooking.guestCount) : '—'}</p></div>
                    <div className="bd-field"><label>Corkage</label><p>{Number(detailBooking.corkageFee) > 0 ? formatPeso(detailBooking.corkageFee) : 'None'}</p></div>
                  </div>
                </div>

                <div className="bd-card">
                  <div className="bd-section-title"><i className="ti ti-credit-card"></i> Payment Breakdown</div>
                  <div className="bd-grid bd-financial-grid">
                    <div className="bd-field"><label>Total charge</label><p>{formatPeso(detailBooking.amount)}</p></div>
                    <div className="bd-field"><label>Payment received</label><p>{formatPeso(netCollected(detailBooking))}</p></div>
                    <div className="bd-field"><label>Balance remaining</label><p>{formatPeso(outstandingBalance(detailBooking))}</p></div>
                  </div>
                </div>
              </div>

              <div className="bd-card">
                <div className="bd-section-title"><i className="ti ti-calendar-event"></i> Reservation Specifications</div>
                <div className="bd-grid bd-spec-grid">
                  <div className="bd-field"><label>Facility Name</label><p>{facilityName(detailBooking)}</p></div>
                  <div className="bd-field"><label>Room</label><p>{detailBooking.variantLabel || '—'}</p></div>
                  <div className="bd-field"><label>Reservation Date</label><p>{detailBooking.date || '—'}</p></div>
                  <div className="bd-field"><label>Check-in Time</label><p>{formatTime(detailBooking.timeIn)}</p></div>
                  <div className="bd-field"><label>Duration</label><p>{detailBooking.duration ? `${detailBooking.duration} hr${detailBooking.duration > 1 ? 's' : ''}` : '—'}</p></div>
                  <div className="bd-field"><label>Reserved On</label><p>{detailBooking.createdAt ? new Date(detailBooking.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}</p></div>
                </div>
              </div>

              {detailBooking.paymentScreenshot && (
                <div className="bd-card">
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

              <div className="bd-row bd-support-row">
                <div className="bd-card">
                  <div className="bd-section-title"><i className="ti ti-credit-card"></i> Payment method</div>
                  <p className="bd-support-value">{recordedPayment(detailBooking) > 0 ? detailBooking.paymentMethod || 'Method not recorded' : 'No payment recorded yet'}</p>
                  <p className="bd-support-caption">{recordedPayment(detailBooking) > 0 ? detailBooking.paymentProvider === 'paymongo' ? 'Paid online' : 'Recorded by staff' : 'Record the method when payment is collected.'}</p>
                </div>
                <div className="bd-card">
                  <div className="bd-section-title"><i className="ti ti-file-text"></i> Notes</div>
                  <p className="bd-notes-body">{detailBooking.specialRequests?.trim() || 'No notes added.'}</p>
                </div>
              </div>

              {detailBooking.cancellationStatus && detailBooking.cancellationStatus !== 'None' && (
                <div className="bd-card">
                  <div className="bd-section-title"><i className="ti ti-file-x"></i> Cancellation review</div>
                  <p className="bd-notes-body">Status: <strong>{detailBooking.cancellationStatus}</strong>{detailBooking.cancellationReason ? ` · ${detailBooking.cancellationReason}` : ''}</p>
                  {detailBooking.cancellationReviewNote && <p className="bd-screenshot-hint">Review note: {detailBooking.cancellationReviewNote}</p>}
                  {detailBooking.cancellationRefundNote && <p className="bd-screenshot-hint">Refund note: {detailBooking.cancellationRefundNote}</p>}
                  {detailBooking.status === 'Cancelled' && cancellationAmounts(detailBooking).refundRemaining > 0 && (
                    <p className="bd-screenshot-hint">Refund to arrange with the guest: {formatPeso(cancellationAmounts(detailBooking).refundRemaining)}. Record it after the manual transfer.</p>
                  )}
                  {canManage && detailBooking.cancellationStatus === 'Requested' && (
                    <button type="button" className="btn-confirm" style={{ marginTop: 12 }} onClick={() => setCancellationReviewId(detailBooking._id)}>Review request</button>
                  )}
                  {canManage && detailBooking.cancellationStatus === 'Approved' && recordedPayment(detailBooking) > Number(detailBooking.refundedAmount || 0) && (
                    <button type="button" className="btn-confirm" style={{ marginTop: 12 }} onClick={() => setCancellationReviewId(detailBooking._id)}>{cancellationAmounts(detailBooking).refundRemaining > 0 ? 'Record manual refund' : 'Review refund exception'}</button>
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions bd-footer">
                {canManage && !['Done', 'No Show', 'Rejected', 'Cancelled'].includes(reservationPresentation(detailBooking, clockMs).status) && detailBooking.status !== 'Ongoing' && (
                  <button
                    className="btn-cancel"
                    onClick={() => { const id = detailBooking._id; setDetailId(null); openEditBooking(id); }}
                  >
                    Edit Reservation
                  </button>
                )}
                {canManage && ['Pending', 'Rejected'].includes(detailBooking.status) && recordedPayment(detailBooking) === 0 && (
                  <button
                    className="btn-cancel"
                    style={{ color: 'var(--red)', borderColor: 'rgba(225,29,72,.3)' }}
                    onClick={async () => { const id = detailBooking._id; setDetailId(null); await deleteBooking(id); }}
                  >
                    Delete
                  </button>
                )}
                {canManage && ['Confirmed', 'Overdue', 'No Show'].includes(reservationPresentation(detailBooking, clockMs).status) && detailBooking.status !== 'Ongoing' && detailBooking.cancellationStatus !== 'Requested' && (detailBooking.status === 'No Show' || clockMs >= (reservationWindow(detailBooking)?.start ?? Infinity)) && (
                  <button
                    className="btn-cancel"
                    style={{ color: 'var(--teal)', borderColor: 'rgba(45,212,191,.35)' }}
                    onClick={() => markBookingDone(detailBooking)}
                  >
                    Mark Done
                  </button>
                )}
                {canManage && ['Pending', 'Confirmed'].includes(detailBooking.status) && reservationPresentation(detailBooking, clockMs).status !== 'No Show' && (
                  <button
                    className="btn-cancel"
                    style={{ color: 'var(--amber)', borderColor: 'rgba(245,165,36,.35)' }}
                    onClick={async () => {
                      if (!(await confirm('Cancel this reservation on behalf of the venue? Use cancellation review for a customer request. The guest will need to rebook if they still want the slot.', { danger: true, confirmText: 'Cancel Reservation' }))) return;
                      await updateBookingStatus(detailBooking._id, 'Cancelled');
                      setDetailId(null);
                    }}
                  >
                    Cancel Reservation
                  </button>
                )}
                {canManage && ['Pending', 'Pending Payment Verification'].includes(detailBooking.status) && (detailBooking.status === 'Pending Payment Verification' || recordedPayment(detailBooking) === 0) && (
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
                    Confirm Reservation
                  </button>
                )}
              <button className="btn-cancel bd-footer-close" onClick={() => setDetailId(null)}>Close</button>
            </div>
          </>
        )}
      </Modal>

      <CancellationReviewModal
        booking={cancellationReviewBooking}
        onClose={() => setCancellationReviewId(null)}
        onSubmit={reviewCancellation}
      />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

function CreateBookingModal({ open, rooms, onClose, onCreated, minDuration = 1, maxDuration = 5 }) {
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestCount, setGuestCount] = useState('1');
  const [roomId, setRoomId] = useState('');
  const [variantLabel, setVariantLabel] = useState('');
  const [date, setDate] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [duration, setDuration] = useState(String(minDuration));
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [hasCorkage, setHasCorkage] = useState(false);
  const [specialRequests, setSpecialRequests] = useState('');
  const [availability, setAvailability] = useState({ key: '', status: 'incomplete' });
  const [saving, setSaving] = useState(false);
  const selectedRoom = rooms.find((room) => room._id === roomId);
  const variants = Array.isArray(selectedRoom?.variants) ? selectedRoom.variants.filter((variant) => variant.status !== 'Unavailable') : [];
  const selectedVariant = variants.find((variant) => variant.label === variantLabel) || null;
  const estimatedCharge = selectedRoom
    ? calculateBookingPrice({ variant: selectedVariant || selectedRoom, startHour: Number.parseInt(timeIn, 10) || 0, duration: Number(duration) || 1, guestCount: Number(guestCount) || 1, hasCorkage }).amount
    : 0;
  const selectionKey = reservationSelectionKey({ roomId, variantLabel, date, duration, timeIn });
  const available = availability.key === selectionKey && availability.status === 'available';

  useEffect(() => {
    if (!open) return;
    setGuestName('');
    setGuestContact('');
    setGuestCount('1');
    setRoomId(rooms[0]?._id || '');
    setVariantLabel('');
    setDate('');
    setTimeIn('');
    setDuration(String(minDuration));
    setPaidAmount('0');
    setPaymentMethod('Cash');
    setHasCorkage(false);
    setSpecialRequests('');
    setAvailability({ key: '', status: 'incomplete' });
  }, [open, rooms, minDuration]);

  useEffect(() => {
    if (variants.length && !variants.some((variant) => variant.label === variantLabel)) setVariantLabel(variants[0].label);
    if (!variants.length) setVariantLabel('');
  }, [roomId, variants, variantLabel]);

  async function submit(event) {
    event.preventDefault();
    const amountReceived = Number(paidAmount);
    const parsedDuration = Number(duration);
    const parsedGuestCount = Number(guestCount);
    if (!guestName.trim() || !roomId || !date || !/^([01]\d|2[0-3]):00$/.test(timeIn) || !Number.isInteger(parsedDuration) || parsedDuration < minDuration || parsedDuration > maxDuration || !Number.isInteger(parsedGuestCount) || parsedGuestCount < 1 || !Number.isFinite(amountReceived) || amountReceived < 0) {
      alert('Complete the guest, room, hourly schedule, and payment fields.');
      return;
    }
    if (!available) {
      alert('Choose an available start time for this reservation.');
      return;
    }
    if (amountReceived > estimatedCharge) {
      alert('Amount received cannot exceed the calculated reservation charge.');
      return;
    }
    setSaving(true);
    try {
      await bookingsService.create({ guestName: guestName.trim(), guestContact: guestContact.trim(), guestCount: parsedGuestCount, hasCorkage, specialRequests: specialRequests.trim(), roomId, variantLabel: variantLabel || undefined, date, timeIn, duration: parsedDuration, paidAmount: amountReceived, paymentMethod });
      onClose();
      await onCreated();
    } catch (err) {
      alert(err.message || 'Could not create the manual reservation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add manual reservation" size="2xl" className="walkin-booking-modal">
      <form onSubmit={submit} className="walkin-booking-form">
        <p className="walkin-form-intro">Enter the guest and choose an available time. The reservation will be confirmed when you create it.</p>

        <section className="walkin-form-section" aria-labelledby="walkin-guest-heading">
          <h3 id="walkin-guest-heading" className="walkin-section-title">Guest</h3>
          <div className="booking-form-grid walkin-guest-grid">
            <div className="mfield"><label htmlFor="manual-guest-name">Guest name</label><input id="manual-guest-name" required value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="e.g. Juan Dela Cruz" /></div>
            <div className="mfield"><label htmlFor="manual-guest-contact">Phone or email <span className="walkin-optional">Optional</span></label><input id="manual-guest-contact" value={guestContact} onChange={(event) => setGuestContact(event.target.value)} placeholder="Contact details" /></div>
            <div className="mfield"><label htmlFor="manual-guest-count">Guests</label><input id="manual-guest-count" type="number" min="1" required value={guestCount} onChange={(event) => setGuestCount(event.target.value)} /></div>
          </div>
        </section>

        <section className="walkin-form-section" aria-labelledby="walkin-schedule-heading">
          <h3 id="walkin-schedule-heading" className="walkin-section-title">Facility & schedule</h3>
          <div className="booking-form-grid walkin-facility-grid">
            <div className="mfield"><label htmlFor="manual-room">Facility</label><select id="manual-room" required value={roomId} onChange={(event) => { setRoomId(event.target.value); setTimeIn(''); }}><option value="">Choose a facility</option>{rooms.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}</select></div>
            <div className="mfield"><label htmlFor="manual-variant">Room type</label><select id="manual-variant" required={variants.length > 0} value={variantLabel} onChange={(event) => { setVariantLabel(event.target.value); setTimeIn(''); }} disabled={!variants.length}><option value="">{variants.length ? 'Choose a room type' : 'Base price'}</option>{variants.map((variant) => <option key={variant.label} value={variant.label}>{variant.label}</option>)}</select></div>
          </div>
          <div className="booking-form-grid walkin-time-grid">
            <div className="mfield"><label htmlFor="manual-date">Date</label><input id="manual-date" type="date" required value={date} min={businessDate()} onChange={(event) => { setDate(event.target.value); setTimeIn(''); }} /></div>
            <div className="mfield"><label htmlFor="manual-duration">Duration (hours)</label><select id="manual-duration" value={duration} onChange={(event) => { setDuration(event.target.value); setTimeIn(''); }}>{Array.from({ length: maxDuration - minDuration + 1 }, (_, index) => String(minDuration + index)).map((hours) => <option key={hours} value={hours}>{hours} hour{hours === '1' ? '' : 's'}</option>)}</select></div>
          </div>
          <ReservationTimePicker room={selectedRoom} variantLabel={variantLabel} date={date} duration={duration} timeIn={timeIn} onSelect={setTimeIn} onAvailabilityChange={setAvailability} />
        </section>

        <section className="walkin-form-section" aria-labelledby="walkin-payment-heading">
          <h3 id="walkin-payment-heading" className="walkin-section-title">Payment</h3>
          <div className="manual-payment-layout">
            <div className="manual-charge"><span>Total reservation charge</span><strong>{available ? formatPeso(estimatedCharge) : '—'}</strong><small>{available ? 'Includes selected hours and any corkage.' : 'Choose an available time to see the charge.'}</small></div>
            <div className="mfield"><label htmlFor="manual-paid">Amount received</label><input id="manual-paid" type="number" min="0" max={estimatedCharge} step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} disabled={!available} /><p className="booking-form-help">Leave at ₱0 to collect at the venue.</p></div>
            {Number(paidAmount) > 0 && <div className="mfield"><label htmlFor="manual-payment-method">Payment method</label><select id="manual-payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>}
          </div>
        </section>

        <section className="walkin-form-section" aria-labelledby="walkin-notes-heading">
          <h3 id="walkin-notes-heading" className="walkin-section-title">Add-ons & notes</h3>
          <label className="booking-addon-check manual-corkage"><input type="checkbox" checked={hasCorkage} onChange={(event) => setHasCorkage(event.target.checked)} /><span><strong>Outside food or drinks</strong><small>Apply the corkage fee to this reservation.</small></span><b>+{formatPeso(CORKAGE_FEE)}</b></label>
          <div className="mfield manual-notes"><label htmlFor="manual-notes">Special requests / notes <span className="walkin-optional">Optional</span></label><textarea id="manual-notes" rows="3" value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} placeholder="Add details the staff should know" /></div>
        </section>

        <div className="modal-actions walkin-actions"><button type="button" className="btn-cancel" onClick={onClose}>Cancel</button><button type="submit" className="btn-confirm" disabled={saving || !available}>{saving ? 'Creating…' : 'Create confirmed reservation'}</button></div>
      </form>
    </Modal>
  );
}

function CancellationReviewModal({ booking, onClose, onSubmit }) {
  const [decision, setDecision] = useState('approve');
  const [refundedAmount, setRefundedAmount] = useState('0');
  const [refundException, setRefundException] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const amounts = cancellationAmounts(booking);
  const alreadyApproved = booking?.cancellationStatus === 'Approved';
  const maxRefund = refundException ? amounts.paid : amounts.refundLimit;
  const noRefundChange = alreadyApproved && Number(refundedAmount) === amounts.refunded && refundException === Boolean(booking?.cancellationRefundException);

  useEffect(() => {
    if (!booking) return;
    setDecision('approve');
    setRefundedAmount(String(booking.refundedAmount ?? 0));
    setRefundException(Boolean(booking.cancellationRefundException));
    setNote('');
  }, [booking]);

  async function submit() {
    const refund = Number(refundedAmount);
    if (!Number.isFinite(refund) || refund < 0) {
      alert('Refund must be a valid non-negative amount.');
      return;
    }
    if (refund < amounts.refunded) {
      alert('Previously recorded refunds cannot be removed.');
      return;
    }
    if (decision === 'approve' && refund > maxRefund) {
      alert(amounts.customerCancelled && !refundException
        ? 'For customer cancellations, retain the first-hour charge. An explained venue or payment issue can be marked as an exception.'
        : 'Refund cannot exceed the recorded payment.');
      return;
    }
    if (refundException && !booking.cancellationRefundException && amounts.customerCancelled && !note.trim()) {
      alert('Explain the venue or payment issue for this refund exception.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(booking._id, { decision, refundedAmount: refund, refundException, note });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!booking} onClose={onClose} title={alreadyApproved ? 'Record manual refund' : 'Review cancellation request'}>
      {booking && (
        <>
          <p className="mfield-note">{booking.guestName} · {booking.reservationCode || shortBookingId(booking)} · recorded payment {formatPeso(recordedPayment(booking))}</p>
          {!alreadyApproved && <div className="mfield"><label htmlFor="cancellation-decision">Decision</label><select id="cancellation-decision" value={decision} onChange={(event) => { setDecision(event.target.value); if (event.target.value === 'reject') { setRefundException(false); setRefundedAmount(String(booking.refundedAmount ?? 0)); } }}><option value="approve">Approve cancellation</option><option value="reject">Reject request</option></select></div>}
          {amounts.customerCancelled && <p className="mfield-note">{booking.cancellationRefundException ? 'Refund exception approved.' : `First-hour charge retained: ${amounts.firstHour === null ? 'needs review' : formatPeso(Math.min(amounts.paid, amounts.firstHour))}.`} Maximum {booking.cancellationRefundException ? 'exception' : 'standard'} refund: {formatPeso(amounts.refundLimit)}.</p>}
          {amounts.customerCancelled && decision === 'approve' && (
            <div className="mfield"><label className="cancellation-exception-label" htmlFor="cancellation-refund-exception"><input id="cancellation-refund-exception" className="cancellation-exception-checkbox" type="checkbox" checked={refundException} onChange={(event) => setRefundException(event.target.checked)} disabled={Boolean(booking.cancellationRefundException)} /> Venue or payment issue exception</label><p className="mfield-note">Use for a venue cancellation, duplicate charge, or verified payment error. Explain it in the note.</p></div>
          )}
          <div className="mfield"><label htmlFor="cancellation-refund">Total manually refunded (₱)</label><input id="cancellation-refund" type="number" min={amounts.refunded} max={maxRefund} step="0.01" value={refundedAmount} onChange={(event) => setRefundedAmount(event.target.value)} disabled={decision === 'reject'} /><p className="mfield-note">Enter the cumulative amount already sent to the guest. This only records the refund; it does not transfer money through PayMongo.</p></div>
          <div className="mfield"><label htmlFor="cancellation-note">Review note</label><textarea id="cancellation-note" rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for the audit trail" /></div>
          <div className="modal-actions"><button type="button" className="btn-cancel" onClick={onClose}>Close</button><button type="button" className="btn-confirm" disabled={saving || noRefundChange} onClick={submit}>{saving ? 'Saving…' : alreadyApproved ? 'Record refund' : 'Save review'}</button></div>
        </>
      )}
    </Modal>
  );
}

function EditBookingModal({ booking, rooms, onClose, onSaved, minDuration, maxDuration }) {
  const { guardPermission } = useAuth();
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [roomId, setRoomId] = useState('');
  const [variantLabel, setVariantLabel] = useState('');
  const [date, setDate] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [duration, setDuration] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [hasCorkage, setHasCorkage] = useState(false);
  const [specialRequests, setSpecialRequests] = useState('');
  const [availability, setAvailability] = useState({ key: '', status: 'incomplete' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (booking) {
      setGuestName(booking.guestName || '');
      setGuestEmail(booking.guestEmail || '');
      setGuestContact(booking.guestContact || '');
      setGuestCount(booking.guestCount ?? '');
      setRoomId(booking.room?._id || booking.room || '');
      setVariantLabel(booking.variantLabel || '');
      setDate(booking.date || '');
      setTimeIn(booking.timeIn || '');
      setDuration(booking.duration || 1);
      setPaymentMethod(booking.paymentMethod || 'Cash');
      setHasCorkage(Number(booking.corkageFee) > 0);
      setSpecialRequests(booking.specialRequests || '');
    }
  }, [booking]);

  const selectedRoom = (rooms || []).find((r) => r._id === roomId) || null;
  const variantOptions = selectedRoom?.variants || [];
  const selectionKey = reservationSelectionKey({ roomId, variantLabel, date, duration, timeIn });
  const scheduleChanged = booking && (roomId !== String(booking.room?._id || booking.room) || (variantLabel || '') !== (booking.variantLabel || '') || date !== booking.date || timeIn !== booking.timeIn || Number(duration) !== Number(booking.duration));
  const available = availability.key === selectionKey && availability.status === 'available';

  function handleRoomChange(nextRoomId) {
    setRoomId(nextRoomId);
    const nextRoom = (rooms || []).find((r) => r._id === nextRoomId) || null;
    setVariantLabel(nextRoom?.variants?.[0]?.label || '');
    setTimeIn('');
  }

  async function handleSave() {
    if (!guardPermission('booking:manage')) return;
    if (!guestName.trim()) {
      alert('Guest name is required.');
      return;
    }
    if (!roomId) {
      alert('Facility is required.');
      return;
    }
    const d = Number(duration);
    if (!Number.isFinite(d) || d < minDuration || d > maxDuration) {
      alert(`Duration must be between ${minDuration} and ${maxDuration} hours.`);
      return;
    }
    if (scheduleChanged && !available) {
      alert('Choose an available start time before saving the new schedule.');
      return;
    }
    setSaving(true);
    try {
      await bookingsService.update(booking._id, {
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestContact: guestContact.trim(),
        guestCount: guestCount === '' ? undefined : Number(guestCount),
        room: roomId,
        variantLabel: variantLabel || null,
        date,
        timeIn,
        duration: d,
        paymentMethod,
        hasCorkage,
        specialRequests: specialRequests.trim(),
      });
      onClose();
      await onSaved();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save changes to this reservation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!booking} onClose={onClose} size="xl">
      {booking && (
        <>
          <div className="modal-lg-title">Edit Reservation</div>
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
                <label>Original downpayment</label>
                <p className="mfield-note">{formatPeso(booking.downPayment)} · use the payment controls to record additional money received.</p>
              </div>
              <div className="mfield">
                <label>Current total charge</label>
                <p className="mfield-note">{formatPeso(booking.amount)} · recalculated automatically when room, time, guests, or corkage changes.</p>
              </div>
              <label className="booking-addon-check"><input type="checkbox" checked={hasCorkage} onChange={(event) => setHasCorkage(event.target.checked)} /><span><strong>Outside food or drinks</strong><small>Apply the ₱{CORKAGE_FEE.toLocaleString()} corkage fee.</small></span></label>
            </div>
          </div>

          <div className="bd-section two-col">
            <div>
              <div className="bd-section-title"><i className="ti ti-calendar-event"></i> Reservation Specifications</div>
              <div className="mfield">
                <label>Facility Name</label>
                <select value={roomId} onChange={(e) => handleRoomChange(e.target.value)}>
                  <option value="">Select a facility…</option>
                  {(rooms || []).map((r) => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="mfield">
                <label>Room</label>
                <select
                  value={variantLabel}
                  onChange={(e) => { setVariantLabel(e.target.value); setTimeIn(''); }}
                  disabled={!variantOptions.length}
                >
                  {!variantOptions.length && <option value="">—</option>}
                  {variantOptions.map((v) => (
                    <option key={v.label} value={v.label}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div className="mfield">
                <label>Reservation Date</label>
                <input type="date" value={date} min={businessDate()} onChange={(e) => { setDate(e.target.value); setTimeIn(''); }} />
              </div>
              <div className="mfield">
                <label>Duration (hours)</label>
                <input
                  type="number"
                  min={minDuration}
                  max={maxDuration}
                  value={duration}
                  onChange={(e) => { setDuration(e.target.value); setTimeIn(''); }}
                />
              </div>
            </div>

            <div>
              <div className="bd-section-title"><i className="ti ti-shield-check"></i> Status</div>
              <ReservationStatus booking={booking} />
              <p className="mfield-note">Use the reservation actions to confirm, complete, or cancel a booking.</p>
            </div>
          </div>

          <div className="bd-section">
            <div className="bd-section-title"><i className="ti ti-clock"></i> Check-in time & availability</div>
            <ReservationTimePicker room={selectedRoom} variantLabel={variantLabel} date={date} duration={duration} timeIn={timeIn} onSelect={setTimeIn} onAvailabilityChange={setAvailability} booking={booking} />
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
            <button className="btn-confirm" disabled={saving || (scheduleChanged && !available)} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Bookings;
