import { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '../../components/DataTable';
import { loginHistoryService } from '../../services/loginHistory';

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'admin', label: 'Admin' },
];

const ROLE_LABELS = { user: 'User', staff: 'Staff', manager: 'Supervisor', super_admin: 'Owner' };
const ROLE_BADGE_CLASS = { super_admin: 'pill-active', manager: 'pill-vacant', staff: 'pill-pending', user: 'pill-done' };
const METHOD_LABELS = { password: 'Password', google: 'Google' };

function statusPill(entry) {
  return entry.status === 'success' ? (
    <span className="pill pill-active">Success</span>
  ) : (
    <span className="pill pill-overdue" title={entry.reason || undefined}>
      Failed{entry.reason ? ` — ${entry.reason}` : ''}
    </span>
  );
}

function LoginHistory() {
  const [tab, setTab] = useState('users');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const searchDebounce = useRef(null);

  const [entries, setEntries] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await loginHistoryService.list({ tab, search: search.trim(), status: statusFilter, page });
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, search, statusFilter, page]);

  useEffect(() => {
    fetchHistory();
  }, [tab, statusFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search, same 300ms pattern as Users.jsx.
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
      fetchHistory();
    }, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(key) {
    if (key === tab) return;
    setTab(key);
    setSearch('');
    setStatusFilter('');
    setPage(1);
  }

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    ...(tab === 'admin'
      ? [{ key: 'role', label: 'Role', render: (e) => <span className={`pill ${ROLE_BADGE_CLASS[e.role] || 'pill-done'}`}>{ROLE_LABELS[e.role] || e.role}</span> }]
      : []),
    { key: 'method', label: 'Method', render: (e) => METHOD_LABELS[e.method] || e.method },
    { key: 'status', label: 'Status', render: statusPill },
    { key: 'ip', label: 'IP Address', render: (e) => e.ip || '—' },
    { key: 'createdAt', label: 'Date & Time', render: (e) => new Date(e.createdAt).toLocaleString() },
  ];

  return (
    <div className="panel active" id="panel-login-history">
      <div className="set-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`set-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{tab === 'admin' ? 'Staff & admin logins' : 'Customer logins'}</span>
        </div>

        <div className="users-filters">
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="users-filter-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="users-filter-input"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={loadError ? [] : entries}
          loading={loading}
          emptyMessage={loadError ? 'Failed to load login history.' : 'No login activity yet.'}
          getRowKey={(e) => e._id}
        />

        {!loading && !loadError && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="card-action" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <i className="ti ti-chevron-left"></i> Prev
            </button>
            <span style={{ fontSize: '.78rem', color: 'var(--muted)', alignSelf: 'center' }}>
              Page {page} of {totalPages}
            </span>
            <button className="card-action" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <i className="ti ti-chevron-right"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginHistory;