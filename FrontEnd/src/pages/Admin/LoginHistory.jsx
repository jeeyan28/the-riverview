import '../../styles/admin/login-history.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '../../components/DataTable';
import { loginHistoryService } from '../../services/loginHistory';
import { ChevronLeft, ChevronRight, Search, ShieldCheck, UserCog, UsersRound } from 'lucide-react';

const TABS = [
  { key: 'users', label: 'Customers', icon: UsersRound, description: 'Customer sign-in attempts' },
  { key: 'admin', label: 'Team', icon: UserCog, description: 'Staff and owner access' },
];

const ROLE_LABELS = { user: 'User', staff: 'Staff', manager: 'Supervisor', super_admin: 'Owner' };
const ROLE_BADGE_CLASS = { super_admin: 'pill-active', manager: 'pill-vacant', staff: 'pill-pending', user: 'pill-done' };
const METHOD_LABELS = { password: 'Password', google: 'Google' };

function deviceLabel(value = '') {
  if (!value) return 'Unknown device';
  const browser = value.includes('Edg/') ? 'Edge' : value.includes('Chrome/') ? 'Chrome' : value.includes('Firefox/') ? 'Firefox' : value.includes('Safari/') ? 'Safari' : 'Browser';
  const system = value.includes('Windows') ? 'Windows' : value.includes('Android') ? 'Android' : /iPhone|iPad/.test(value) ? 'iOS' : value.includes('Mac OS') ? 'macOS' : 'Device';
  return `${browser} on ${system}`;
}

function loginTime(value) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await loginHistoryService.list({ tab, search: search.trim(), status: statusFilter, page });
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setTotalPages(data.totalPages || 1);
      setTotal(Number(data.total) || 0);
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
    { key: 'ip', label: 'IP address', render: (e) => e.ip || '—' },
    { key: 'device', label: 'Device', render: (e) => <span title={e.userAgent || undefined}>{deviceLabel(e.userAgent)}</span> },
    { key: 'createdAt', label: 'Date & time', render: (e) => loginTime(e.createdAt) },
  ];

  const successCount = entries.filter((entry) => entry.status === 'success').length;
  const failedCount = entries.filter((entry) => entry.status === 'failed').length;

  return (
    <div className="panel active" id="panel-login-history">
      <div className="login-history-intro">
        <div><h2>Account access history</h2><p>Review successful and failed sign-ins, including the device and network address recorded for each attempt.</p></div>
        <ShieldCheck size={24} aria-hidden="true" />
      </div>

      <div className="login-history-tabs" role="tablist" aria-label="Login account type">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => switchTab(t.key)}
          >
            <t.icon size={17} aria-hidden="true" /><span><strong>{t.label}</strong><small>{t.description}</small></span>
          </button>
        ))}
      </div>

      <div className="login-history-summary">
        <div><span>Matching attempts</span><strong>{total}</strong></div>
        <div><span>Successful on this page</span><strong>{successCount}</strong></div>
        <div className={failedCount ? 'has-failures' : ''}><span>Failed on this page</span><strong>{failedCount}</strong></div>
      </div>

      <div className="card login-history-card">
        <div className="card-head">
          <div><span className="card-title">{tab === 'admin' ? 'Team access log' : 'Customer access log'}</span><p className="login-history-caption">Newest attempts appear first. Times use Asia/Manila.</p></div>
        </div>

        <div className="login-history-filters">
          <label className="login-history-search"><span className="visually-hidden">Search name or email</span><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label><span>Status</span><select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="">All attempts</option><option value="success">Successful</option><option value="failed">Failed</option></select></label>
        </div>

        <DataTable
          columns={columns}
          rows={loadError ? [] : entries}
          loading={loading}
          emptyMessage={loadError ? 'Failed to load login history.' : 'No login activity yet.'}
          getRowKey={(e) => e._id}
          paginate={false}
        />

        {!loading && !loadError && totalPages > 1 && (
          <div className="login-history-pagination">
            <button type="button" className="card-action" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={15} aria-hidden="true" /> Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button type="button" className="card-action" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginHistory;
