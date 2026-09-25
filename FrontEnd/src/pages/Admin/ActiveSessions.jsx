import '../../styles/admin/settings.css';
import '../../styles/admin/login-history.css';
import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import DataTable from '../../components/DataTable';
import { activeSessionsService } from '../../services/activeSessions';

const POLL_MS = 30000;

function formatStamp(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function relativeLabel(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60 * 1000) return 'Just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function initialsOf(name) {
  const letters = (name || '?').trim().split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join('');
  return letters.toUpperCase() || '?';
}

function ActiveSessions() {
  const [data, setData] = useState({ entries: [], total: 0, online: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    async function load({ silent = false } = {}) {
      if (!silent) setLoading(true);
      setLoadError('');
      try {
        const result = await activeSessionsService.list();
        if (active) setData(result);
      } catch (err) {
        console.error(err);
        if (active) setLoadError(err.message || 'Could not load active sessions.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const handle = setInterval(() => load({ silent: true }), POLL_MS);
    return () => {
      active = false;
      clearInterval(handle);
    };
  }, []);

  const columns = [
    {
      key: 'name',
      label: 'Account',
      render: (entry) => (
        <div className="as-user-cell">
          <span className="as-avatar">{initialsOf(entry.name)}</span>
          <div className="as-user-text">
            <span>{entry.name}{entry.current && <em className="as-you-tag">You</em>}</span>
            <small>{entry.email || '—'}</small>
          </div>
        </div>
      ),
    },
    { key: 'role', label: 'Role', render: (entry) => <span className="pill pill-vacant">{entry.role}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (entry) => (entry.online
        ? <span className="pill pill-active">Online now</span>
        : <span className="pill pill-pending">Idle</span>),
    },
    { key: 'signedInAt', label: 'Signed in', render: (entry) => formatStamp(entry.signedInAt) },
    { key: 'lastSeen', label: 'Last active', render: (entry) => relativeLabel(entry.lastSeen) },
  ];

  return (
    <div className="panel active" id="panel-active-sessions">
      <div className="settings-intro">
        <div>
          <h2>Who is using the system</h2>
          <p>Every account signed in right now — staff and customers. Refreshes every 30 seconds.</p>
        </div>
        <UsersRound size={23} aria-hidden="true" />
      </div>

      <div className="login-history-summary">
        <div><span>Signed in</span><strong>{loading && data.total === 0 ? '—' : data.total}</strong></div>
        <div><span>Active now</span><strong>{loading && data.online === 0 ? '—' : data.online}</strong></div>
        <div><span>Idle</span><strong>{Math.max(0, data.total - data.online)}</strong></div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Signed-in accounts</span>
          <span className="audit-summary">{data.total} session{data.total === 1 ? '' : 's'}</span>
        </div>
        <DataTable
          columns={columns}
          rows={loadError ? [] : data.entries}
          loading={loading}
          emptyMessage={loadError || 'No one is signed in right now.'}
          getRowKey={(entry) => entry.key}
          paginate={false}
        />
      </div>
    </div>
  );
}

export default ActiveSessions;
