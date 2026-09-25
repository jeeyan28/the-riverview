import { useState } from 'react';
import { CalendarClock, Timer, X } from 'lucide-react';
import { buildTimeWarnings, useAdminTimeWarnings } from '../hooks/useAdminTimeWarnings';

const MAX_VISIBLE = 3;

function AdminTimeWarningDock() {
  const { sessions, bookings } = useAdminTimeWarnings();
  const [dismissed, setDismissed] = useState(() => new Set());

  const warnings = buildTimeWarnings(sessions, bookings).filter((item) => !dismissed.has(item.key));
  if (!warnings.length) return null;

  const visible = warnings.slice(0, MAX_VISIBLE);
  const hidden = warnings.length - visible.length;

  function dismiss(key) {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  return (
    <aside className="aw-dock" role="alert" aria-label="Time warnings">
      {visible.map((item) => (
        <div className={`aw-card aw-${item.severity}`} key={item.key}>
          <span className="aw-icon" aria-hidden="true">
            {item.kind === 'session' ? <Timer size={16} /> : <CalendarClock size={16} />}
          </span>
          <span className="aw-copy">
            <strong className="aw-title">{item.title}</strong>
            <span className="aw-detail">{item.detail}</span>
            <span className="aw-hint">{item.hint}</span>
          </span>
          <button
            type="button"
            className="aw-dismiss"
            aria-label={`Dismiss: ${item.title}`}
            onClick={() => dismiss(item.key)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      {hidden > 0 && <div className="aw-more">{hidden} more {hidden === 1 ? 'warning' : 'warnings'}</div>}
    </aside>
  );
}

export default AdminTimeWarningDock;
