import { useEffect, useRef, useState } from 'react';

function AnnouncementsBell({ items, unreadCount, markRead, variant = 'desktop' }) {
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
    return () => document.removeEventListener('click', handleDocClick);
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <i className="fa-solid fa-bell"></i>
        {unreadCount > 0 && (
          <span className="announcements-bell-badge" id={idFor('bell-badge')}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <div className={`announcements-panel${open ? ' open' : ''}`} id={idFor('panel')}>
        <div className="announcements-panel-header">
          <span className="announcements-panel-title">Announcements</span>
          <span className="announcements-panel-subtitle">
            {unreadCount > 0 ? `${unreadCount > 99 ? '99+' : unreadCount} unread` : 'All caught up'}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="announcements-empty" id={idFor('empty')}>
            <div className="announcements-empty-icon">
              <i className="fa-regular fa-bell-slash"></i>
            </div>
            <p>No announcements right now.</p>
          </div>
        ) : (
          <ul className="announcements-list" id={idFor('list')}>
            {items.map((a) => (
              <li
                key={a._id}
                className={`announcement-item${a.isRead ? ' is-read' : ''}`}
                onClick={() => {
                  if (!a.isRead) markRead(a._id);
                }}
              >
                <span className="announcement-item-icon">
                  <span className="announcement-item-emoji">{a.emoji}</span>
                </span>
                <div className="announcement-item-body">
                  <p className="announcement-item-title">{a.title}</p>
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
                    ✕
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