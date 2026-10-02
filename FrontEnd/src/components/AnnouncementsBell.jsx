import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CalendarX2, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import '../styles/reservation-notifications.css';

function AnnouncementsBell({ variant = 'desktop', items = [], unreadCount = 0, loading = false, error = '', refresh, markRead, markAllRead, onOpenReservation }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const rootRef = useRef(null);
  const idFor = (name) => `announcements-${name}-${variant}`;

  useEffect(() => {
    if (!open) return;
    function handleDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleDocClick);
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleDocClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div
      className="announcements-bell"
      id={idFor('bell')}
      ref={rootRef}
    >
      <button
        type="button"
        className="announcements-bell-btn"
        id={idFor('bell-btn')}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls={idFor('panel')}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) refresh?.();
          setOpen((o) => !o);
        }}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && <span className="rv-notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      <div className={`announcements-panel${open ? ' open' : ''}`} id={idFor('panel')} role="dialog" aria-label="Notifications" hidden={!open}>
        <div className="announcements-panel-header">
          <div><span className="announcements-panel-title">Notifications</span><span className="announcements-panel-subtitle">{unreadCount ? `${unreadCount} unread reservation update${unreadCount === 1 ? '' : 's'}` : 'You’re all caught up'}</span></div>
          {unreadCount > 0 && <button type="button" className="rv-notification-read-all" disabled={reading} onClick={async () => {
            setReading(true); setReadError('');
            try { await markAllRead?.(); } catch { setReadError('Could not mark notifications read. Try again.'); }
            finally { setReading(false); }
          }}>Mark all read</button>}
        </div>

        {(error || readError) && <div className="rv-notification-error" role="status">{readError || error}{error && <button type="button" onClick={refresh}>Retry</button>}</div>}
        {items.length > 0 && <div className="rv-notification-list">
          {items.map(item => {
            const Icon = item.type === 'closure' ? CalendarX2 : item.type === 'refund_completed' ? CheckCircle2 : item.type === 'refund_processing' ? Clock3 : RotateCcw;
            return <button type="button" key={item._id} className={`rv-notification-item${item.readAt ? '' : ' is-unread'}`} onClick={() => {
              if (!item.readAt) markRead?.(item._id).catch(() => setReadError('Could not mark this update read. Try again.'));
              setOpen(false); onOpenReservation?.(item);
            }}>
              <Icon size={19} aria-hidden="true" />
              <span><strong>{item.title}</strong><span className="rv-notification-message">{item.message}</span><small>{item.reservationCode} · {new Date(item.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</small></span>
              {!item.readAt && <span className="rv-notification-dot" aria-label="Unread" />}
            </button>;
          })}
        </div>}
        {!items.length && !error && <div className="announcements-empty" id={idFor('empty')}>
          <div className="announcements-empty-icon">
            <BellOff size={22} aria-hidden="true" />
          </div>
          <p>{loading ? 'Loading notifications…' : 'No notifications yet.'}</p>
        </div>}
      </div>
    </div>
  );
}

export default AnnouncementsBell;
