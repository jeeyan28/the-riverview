import '../../styles/admin/dashboard.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import { dashboardService } from '../../services/dashboard';
import { monitorRoomsService, roomSessionsService } from '../../services/monitoring';
import { bookingsService } from '../../services/bookings';
import { formatPeso } from '../../utils/currency';
import { dateKey } from '../../utils/rooms';
import { buildRoomView, formatTimeRemaining } from '../../hooks/useRoomMonitorData';

const STATUS_PILL_CLASS = {
  Ongoing: 'pill-active',
  Pending: 'pill-pending',
  Done: 'pill-done',
  Overdue: 'pill-overdue',
  Cancelled: 'pill-done',
  'Pending Payment Verification': 'pill-pending',
  Confirmed: 'pill-active',
  Rejected: 'pill-overdue',
};

const ROOM_STATUS_PILL_CLASS = {
  Available: 'pill-vacant',
  Occupied: 'pill-active',
  'Under Maintenance': 'pill-overdue',
  Inactive: 'pill-vacant',
};
const ROOM_STATUS_DOT_CLASS = {
  Available: 'dash-dot-vacant',
  Occupied: 'dash-dot-active',
  'Under Maintenance': 'dash-dot-overdue',
  Inactive: 'dash-dot-vacant',
};

const DASHBOARD_POLL_MS = 15000;

function initialsOf(name) {
  return (
    (name || '?')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function facilityBreakdownLabel(byFacility) {
  if (!byFacility || byFacility.length === 0) return 'No active sessions';
  return byFacility.map((f) => `${f.count} ${f.facilityName}`).join(' · ');
}

function Dashboard() {
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(false);
  const [, forceTick] = useState(0);

  const [recentBookings, setRecentBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState(false);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const loadRooms = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRoomsLoading(true);
    if (!silent) setRoomsError(false);
    try {
      const [roomsData, sessionsData] = await Promise.all([monitorRoomsService.list(), roomSessionsService.list()]);
      if (unmountedRef.current) return;
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
    } catch (err) {
      console.error(err);
      if (!unmountedRef.current && !silent) setRoomsError(true);
    } finally {
      if (!unmountedRef.current && !silent) setRoomsLoading(false);
    }
  }, []);

  const loadRecentBookings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setBookingsLoading(true);
    if (!silent) setBookingsError(false);
    try {
      const today = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      const data = await bookingsService.list({ date: today });
      if (unmountedRef.current) return;
      setRecentBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      if (!unmountedRef.current && !silent) setBookingsError(true);
    } finally {
      if (!unmountedRef.current && !silent) setBookingsLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setSummaryLoading(true);
    if (!silent) setSummaryError(false);
    try {
      const data = await dashboardService.getSummary();
      if (unmountedRef.current) return;
      setSummary(data);
    } catch (err) {
      console.error(err);
      if (!unmountedRef.current && !silent) setSummaryError(true);
    } finally {
      if (!unmountedRef.current && !silent) setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
    loadRecentBookings();
    loadSummary();
    const tickHandle = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(tickHandle);
  }, [loadRooms, loadRecentBookings, loadSummary]);

  useEffect(() => {
    const pollHandle = setInterval(() => {
      loadRooms({ silent: true });
      loadRecentBookings({ silent: true });
      loadSummary({ silent: true });
    }, DASHBOARD_POLL_MS);
    return () => clearInterval(pollHandle);
  }, [loadRooms, loadRecentBookings, loadSummary]);

  const recentColumns = [
    {
      key: 'guest',
      label: 'Guest',
      render: (b) => (
        <div className="dash-guest-cell">
          <span className="dash-avatar">{initialsOf(b.guestName)}</span>
          <span>{b.guestName}</span>
        </div>
      ),
    },
    { key: 'roomLabel', label: 'Room' },
    { key: 'timeIn', label: 'Time In' },
    {
      key: 'status',
      label: 'Status',
      render: (b) => <span className={`pill ${STATUS_PILL_CLASS[b.status] || 'pill-pending'}`}>{b.status}</span>,
    },
  ];

  const bookingsDelta = summary?.todayBookings?.deltaVsYesterday ?? 0;
  const revenuePercent = summary?.todayRevenue?.percentVsAvg ?? 0;
  const overdueCount = summary?.overdueRooms?.count ?? 0;

  const roomViews = rooms
    .map((r) => ({ room: r, view: buildRoomView(r, sessions) }))
    .sort((a, b) => {
      if (a.view.occupancy && b.view.occupancy) return a.view.remaining - b.view.remaining;
      if (a.view.occupancy) return -1;
      if (b.view.occupancy) return 1;
      return 0;
    })
    .slice(0, 10);

  return (
    <div className="panel active" id="panel-dashboard">
      <div className="metric-row">
        <div className="mc">
          <div className="mc-label"><i className="ti ti-calendar-check"></i>Today's Reservations</div>
          <div className="mc-val">{summaryLoading ? '—' : summaryError ? '—' : summary.todayBookings.count}</div>
          {!summaryLoading && !summaryError && (
            <div className={`mc-sub ${bookingsDelta > 0 ? 'up' : bookingsDelta < 0 ? 'dn' : ''}`}>
              {bookingsDelta !== 0 && <i className={`ti ${bookingsDelta > 0 ? 'ti-trending-up' : 'ti-trending-down'}`}></i>}
              {bookingsDelta > 0 ? `+${bookingsDelta} vs yesterday` : bookingsDelta < 0 ? `${bookingsDelta} vs yesterday` : 'Same as yesterday'}
            </div>
          )}
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-door-enter"></i>Active Sessions</div>
          <div className="mc-val">{summaryLoading ? '—' : summaryError ? '—' : summary.activeSessions.count}</div>
          {!summaryLoading && !summaryError && (
            <div className="mc-sub">{facilityBreakdownLabel(summary.activeSessions.byFacility)}</div>
          )}
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-cash"></i>Today's Revenue</div>
          <div className="mc-val">{summaryLoading ? '—' : summaryError ? '—' : formatPeso(summary.todayRevenue.amount)}</div>
          {!summaryLoading && !summaryError && (
            <div className={`mc-sub ${summary.todayRevenue.direction === 'up' ? 'up' : summary.todayRevenue.direction === 'down' ? 'dn' : ''}`}>
              {summary.todayRevenue.direction !== 'flat' && (
                <i className={`ti ${summary.todayRevenue.direction === 'up' ? 'ti-trending-up' : 'ti-trending-down'}`}></i>
              )}
              {summary.todayRevenue.direction === 'flat' ? 'On par with avg' : `${revenuePercent > 0 ? '+' : ''}${revenuePercent}% vs avg`}
            </div>
          )}
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-alert-triangle"></i>Overdue Rooms</div>
          <div className="mc-val">{summaryLoading ? '—' : summaryError ? '—' : overdueCount}</div>
          {!summaryLoading && !summaryError && (
            <div className={`mc-sub ${overdueCount > 0 ? 'dn' : 'up'}`}>{overdueCount > 0 ? 'Needs attention' : 'All caught up'}</div>
          )}
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Recent Reservations</span>
            <button className="card-action" onClick={() => navigate('/admin/bookings')}>
              View all →
            </button>
          </div>
          <DataTable
            columns={recentColumns}
            rows={recentBookings}
            loading={bookingsLoading}
            emptyMessage={bookingsError ? 'Could not load reservations.' : 'No reservations yet.'}
            getRowKey={(b) => b._id}
            paginate={false}
          />
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Room Status</span></div>
          <div id="dash-room-status" className="dash-room-status">
            {roomsLoading ? (
              <div className="dash-empty-state">Loading…</div>
            ) : roomsError ? (
              <div className="dash-empty-state">Could not load rooms.</div>
            ) : rooms.length === 0 ? (
              <div className="dash-empty-state">No rooms yet.</div>
            ) : (
              roomViews.map(({ room: r, view }) => (
                <div className="dash-room-row" key={r._id}>
                  <span className={`dash-room-dot ${ROOM_STATUS_DOT_CLASS[r.status] || 'dash-dot-vacant'}`}></span>
                  <span className="dash-room-num">{r.roomNumber}</span>
                  {view.occupancy && (
                    <span className={`dash-room-time${view.isCritical || view.isPastEnd ? ' critical' : view.isWarning ? ' warning' : ''}`}>
                      {formatTimeRemaining(view.remaining, view.isPastEnd)}
                    </span>
                  )}
                  <span className={`pill ${ROOM_STATUS_PILL_CLASS[r.status] || 'pill-vacant'}`}>{r.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Quick Actions</span></div>
        <div className="qa-row">
          <button className="qa-btn" onClick={() => navigate('/admin/bookings?openManualBooking=1')}>
            <span className="qa-ico"><i className="ti ti-plus"></i></span>
            <span className="qa-label">Add Reservation</span>
          </button>
          <button className="qa-btn" onClick={() => navigate('/admin/monitor')}>
            <span className="qa-ico"><i className="ti ti-device-desktop-analytics"></i></span>
            <span className="qa-label">Monitor Rooms</span>
          </button>
          <button className="qa-btn" onClick={() => navigate('/admin/reports')}>
            <span className="qa-ico"><i className="ti ti-download"></i></span>
            <span className="qa-label">Export Report</span>
          </button>
          <button className="qa-btn" onClick={() => navigate('/admin/logs')}>
            <span className="qa-ico"><i className="ti ti-lock-access"></i></span>
            <span className="qa-label">Login Logs</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;