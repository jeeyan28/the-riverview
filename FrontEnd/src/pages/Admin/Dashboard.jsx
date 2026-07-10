import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/DataTable';



const API_BASE_URL = 'http://localhost:3000'; // matches every other page pre-Phase 9

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

function Dashboard() {
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(false);

  const [recentBookings, setRecentBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      setRoomsLoading(true);
      setRoomsError(false);
      try {
        const res = await fetch(`${API_BASE_URL}/api/rooms`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load rooms.');
        const data = await res.json();
        if (!cancelled) setRooms(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setRoomsError(true);
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    }

    async function loadRecentBookings() {
      setBookingsLoading(true);
      setBookingsError(false);
      try {
        const res = await fetch(`${API_BASE_URL}/api/bookings`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load bookings.');
        const data = await res.json();
        if (!cancelled) setRecentBookings((Array.isArray(data) ? data : []).slice(0, 5));
      } catch (err) {
        console.error(err);
        if (!cancelled) setBookingsError(true);
      } finally {
        if (!cancelled) setBookingsLoading(false);
      }
    }

    loadRooms();
    loadRecentBookings();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <div className="panel active" id="panel-dashboard">
      <div className="metric-row">
        <div className="mc">
          <div className="mc-label"><i className="ti ti-calendar-check"></i>Today's Bookings</div>
          <div className="mc-val">14</div>
          <div className="mc-sub up"><i className="ti ti-trending-up"></i> +3 vs yesterday</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-door-enter"></i>Active Sessions</div>
          <div className="mc-val">7</div>
          <div className="mc-sub">4 Billiards · 2 KTV · 1 Court</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-cash"></i>Today's Revenue</div>
          <div className="mc-val">₱6,450</div>
          <div className="mc-sub up"><i className="ti ti-trending-up"></i> +12% vs avg</div>
        </div>
        <div className="mc">
          <div className="mc-label"><i className="ti ti-alert-triangle"></i>Overdue Rooms</div>
          <div className="mc-val">2</div>
          <div className="mc-sub dn">Needs attention</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Recent Bookings</span>
            <button className="card-action" onClick={() => navigate('/admin/bookings')}>
              View all →
            </button>
          </div>
          <DataTable
            columns={recentColumns}
            rows={recentBookings}
            loading={bookingsLoading}
            emptyMessage={bookingsError ? 'Could not load bookings.' : 'No bookings yet.'}
            getRowKey={(b) => b._id}
          />
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Room Status</span></div>
          <div id="dash-room-status" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {roomsLoading ? (
              <div className="dash-empty-state">Loading…</div>
            ) : roomsError ? (
              <div className="dash-empty-state">Could not load rooms.</div>
            ) : rooms.length === 0 ? (
              <div className="dash-empty-state">No rooms yet.</div>
            ) : (
              rooms.map((r) => (
                <div className="dash-room-row" key={r._id}>
                  <span className={`dash-room-dot ${ROOM_STATUS_DOT_CLASS[r.status] || 'dash-dot-vacant'}`}></span>
                  <span className="dash-room-num">{r.roomNumber}</span>
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
            <span className="qa-label">Add Booking</span>
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
