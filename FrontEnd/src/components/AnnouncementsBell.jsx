import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check, Megaphone } from 'lucide-react';
import { timeAgo } from '../utils/time';

function AnnouncementsBell({ items = [], unreadCount = 0, markRead, variant = 'desktop' }) {
  const [open, setOpen] = useState(false);
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
        aria-label="Announcements"
        aria-expanded={open}
        aria-controls={idFor('panel')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="announcements-bell-badge" id={idFor('bell-badge')}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <div className={`announcements-panel${open ? ' open' : ''}`} id={idFor('panel')} role="dialog" aria-label="Venue announcements">
        <div className="announcements-panel-header">
          <div><span className="announcements-panel-title">Venue updates</span><span className="announcements-panel-subtitle">{unreadCount > 0 ? `${unreadCount > 99 ? '99+' : unreadCount} unread` : 'You’re up to date'}</span></div>
          {unreadCount > 0 && <button type="button" className="announcements-mark-all" onClick={() => items.filter((item) => !item.isRead).forEach((item) => markRead(item._id))}><Check size={14} /> Mark all read</button>}
        </div>

        {items.length === 0 ? (
          <div className="announcements-empty" id={idFor('empty')}>
            <div className="announcements-empty-icon">
              <BellOff size={22} aria-hidden="true" />
            </div>
            <p>No venue updates right now.</p>
          </div>
        ) : (
          <ul className="announcements-list" id={idFor('list')}>
            {items.map((a) => (
              <li
                key={a._id}
                className={`announcement-item${a.isRead ? ' is-read' : ''}`}
              >
                <span className="announcement-item-icon">
                  <Megaphone size={17} aria-hidden="true" />
                </span>
                <div className="announcement-item-body">
                  <div className="announcement-item-top">
                    <p className="announcement-item-title">{a.title}</p>
                    <span className="announcement-item-time">{timeAgo(a.createdAt)}</span>
                  </div>
                  <p className="announcement-item-message">{a.message}</p>
                </div>
                {!a.isRead && (
                  <button
                    type="button"
                    className="announcement-item-close"
                    aria-label="Mark announcement as read"
                    onClick={(e) => {
                      e.stopPropagation();
                      markRead(a._id);
                    }}
                  >
                    <Check size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AnnouncementsBell;
