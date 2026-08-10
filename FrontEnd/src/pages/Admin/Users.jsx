import '../../styles/admin/users.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import PasswordInput from '../../components/PasswordInput';
import PasswordRequirementsList from '../../components/PasswordRequirementsList';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { usersService } from '../../services/users';
import { PASSWORD_REQUIREMENTS } from '../../utils/password';

const ROLE_LABELS = { user: 'User', staff: 'Staff', manager: 'Supervisor', super_admin: 'Owner' };
const ROLE_BADGE_CLASS = { super_admin: 'pill-active', manager: 'pill-vacant', staff: 'pill-pending', user: 'pill-done' };
const SEARCH_DEBOUNCE_MS = 300;

const GUEST_STATUS_BADGE_CLASS = { active: 'pill-active', recovery_pending: 'pill-pending', deleted: 'pill-overdue' };
function guestStatusLabel(u) {
  if (u.guestStatus === 'active') return 'Active Guest';
  if (u.guestStatus === 'recovery_pending') return 'Recovery Pending';
  if (u.guestStatus === 'deleted') {
    const until = u.guestRecoverableUntil ? new Date(u.guestRecoverableUntil).toLocaleDateString() : '';
    return `Deleted Guest${until ? ` (recoverable until ${until})` : ''}`;
  }
  return '—';
}

function initials(firstName, lastName) {
  const a = (firstName || '').trim()[0] || '';
  const b = (lastName || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

function Users() {
  const { initializing, guardPermission } = useAuth();
  const { confirm, confirmProps } = useConfirm();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [guestStatusFilter, setGuestStatusFilter] = useState('');
  const [cleaningUp, setCleaningUp] = useState(false);
  const searchDebounce = useRef(null);

  const [users, setUsers] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [assignableRoleChanges, setAssignableRoleChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState(null);
  const [recoverTarget, setRecoverTarget] = useState(null);

  const fetchUsers = useCallback(async () => {
    if (initializing) return;
    if (!guardPermission('admin:manage', "You don't have permission to manage users.")) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const params = { search: search.trim() };
      if (activeTab === 'guests') {
        params.isGuest = true;
        if (guestStatusFilter === 'active') params.deleted = false;
        if (guestStatusFilter === 'deleted') params.deleted = true;
      } else {
        params.role = roleFilter;
      }
      const data = await usersService.list(params);
      setUsers(Array.isArray(data.users) ? data.users : []);
      setAssignableRoles(Array.isArray(data.assignableRoles) ? data.assignableRoles : []);
      setAssignableRoleChanges(Array.isArray(data.assignableRoleChanges) ? data.assignableRoleChanges : []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeTab, guestStatusFilter, initializing]);

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, activeTab, guestStatusFilter, initializing]);

  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(fetchUsers, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.isActive).length,
      deactivated: users.filter((u) => !u.isActive).length,
      staff: users.filter((u) => u.role !== 'user').length,
    }),
    [users]
  );

  const guestStats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.guestStatus === 'active').length,
      recoveryPending: users.filter((u) => u.guestStatus === 'recovery_pending').length,
      deleted: users.filter((u) => u.guestStatus === 'deleted').length,
    }),
    [users]
  );

  function openAddUser() {
    if (!guardPermission('admin:manage', "You don't have permission to manage users.")) return;
    setAddOpen(true);
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setRoleFilter('');
    setGuestStatusFilter('');
  }

  function clearFilters() {
    setSearch('');
    setRoleFilter('');
    setGuestStatusFilter('');
  }

  async function toggleUserStatus(user) {
    const makeActive = !user.isActive;
    if (!(await confirm(
      makeActive ? 'Reactivate this account?' : 'Deactivate this account? They will be signed out and unable to log in.',
      makeActive ? { confirmText: 'Reactivate' } : { danger: true, confirmText: 'Deactivate' }
    ))) return;
    try {
      await usersService.updateStatus(user._id, makeActive);
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  async function runCleanupNow() {
    if (!(await confirm(
      'Hard-delete all guest accounts past their 60-day recovery window? This cannot be undone.',
      { danger: true, confirmText: 'Run Cleanup' }
    ))) return;
    setCleaningUp(true);
    try {
      const data = await usersService.cleanupGuestsNow();
      await fetchUsers();
      alert(`Cleanup complete: ${data.deletedCount} expired guest account(s) hard-deleted.`);
    } catch (err) {
      alert(err.message);
    } finally {
      setCleaningUp(false);
    }
  }

  async function deleteUser(user) {
    if (!(await confirm(`Permanently delete ${user.firstName} ${user.lastName}? This cannot be undone.`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await usersService.remove(user._id);
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  const nameColumn = {
    key: 'name',
    label: 'User',
    sortable: true,
    sortValue: (u) => `${u.firstName} ${u.lastName}`,
    render: (u) => (
      <div className="um-user">
        <div className="um-avatar">{initials(u.firstName, u.lastName)}</div>
        <div className="um-user-info">
          <span className="um-user-name">{u.firstName} {u.lastName}</span>
          <span className="um-user-email">{u.email}</span>
        </div>
      </div>
    ),
  };

  const lastLoginColumn = {
    key: 'lastLoginAt',
    label: 'Last Login',
    sortable: true,
    sortValue: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0),
    render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'),
  };

  const actionsColumn = {
    key: 'actions',
    label: 'Actions',
    render: (u) =>
      u.canManage ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="card-action" title="Change role" onClick={() => setRoleChangeTarget(u)}>
            <i className="ti ti-shield-cog"></i>
          </button>
          <button className="card-action" title={u.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleUserStatus(u)}>
            <i className={`ti ti-${u.isActive ? 'lock' : 'lock-open'}`}></i>
          </button>
          <button className="card-action" title="Delete" style={{ color: 'var(--red)' }} onClick={() => deleteUser(u)}>
            <i className="ti ti-trash"></i>
          </button>
        </div>
      ) : (
        <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>—</span>
      ),
  };

  const allColumns = [
    nameColumn,
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      sortValue: (u) => u.roleLabel || ROLE_LABELS[u.role] || u.role,
      render: (u) => <span className={`pill ${ROLE_BADGE_CLASS[u.role] || 'pill-done'}`}>{u.roleLabel || ROLE_LABELS[u.role] || u.role}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (u) => (u.isActive ? 1 : 0),
      render: (u) => (u.isActive ? <span className="pill pill-active">Active</span> : <span className="pill pill-overdue">Deactivated</span>),
    },
    lastLoginColumn,
    actionsColumn,
  ];

  const guestActionsColumn = {
    key: 'actions',
    label: 'Actions',
    render: (u) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {u.canManage && u.guestDeletedAt && (
          <button className="card-action" title="Recover" onClick={() => setRecoverTarget(u)}>
            <i className="ti ti-rotate-clockwise-2"></i>
          </button>
        )}
        {u.canManage ? (
          <>
            <button className="card-action" title={u.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleUserStatus(u)}>
              <i className={`ti ti-${u.isActive ? 'lock' : 'lock-open'}`}></i>
            </button>
            <button className="card-action" title="Delete" style={{ color: 'var(--red)' }} onClick={() => deleteUser(u)}>
              <i className="ti ti-trash"></i>
            </button>
          </>
        ) : (
          !u.guestDeletedAt && <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>—</span>
        )}
      </div>
    ),
  };

  const guestColumns = [
    nameColumn,
    {
      key: 'guestStatus',
      label: 'Guest Status',
      sortable: true,
      sortValue: (u) => guestStatusLabel(u),
      render: (u) => <span className={`pill ${GUEST_STATUS_BADGE_CLASS[u.guestStatus] || 'pill-done'}`}>{guestStatusLabel(u)}</span>,
    },
    lastLoginColumn,
    guestActionsColumn,
  ];

  const columns = activeTab === 'guests' ? guestColumns : allColumns;

  const hasActiveFilters = activeTab === 'guests' ? !!(search || guestStatusFilter) : !!(search || roleFilter);

  return (
    <div className="panel active" id="panel-users">
      <div className="um-tabs">
        <button type="button" className={`um-tab${activeTab === 'all' ? ' active' : ''}`} onClick={() => switchTab('all')}>
          All Users
        </button>
        <button type="button" className={`um-tab${activeTab === 'guests' ? ' active' : ''}`} onClick={() => switchTab('guests')}>
          <i className="ti ti-user-question"></i> Guests
        </button>
      </div>

      {activeTab === 'guests' ? (
        <div className="metric-row">
          <div className="mc">
            <div className="mc-label"><i className="ti ti-users"></i> Total Guests</div>
            <div className="mc-val">{guestStats.total.toLocaleString()}</div>
          </div>
          <div className="mc">
            <div className="mc-label"><i className="ti ti-user-check"></i> Active</div>
            <div className="mc-val">{guestStats.active.toLocaleString()}</div>
          </div>
          <div className="mc">
            <div className="mc-label"><i className="ti ti-clock-hour-4"></i> Recovery Pending</div>
            <div className="mc-val">{guestStats.recoveryPending.toLocaleString()}</div>
          </div>
          <div className="mc">
            <div className="mc-label"><i className="ti ti-user-off"></i> Deleted (recoverable)</div>
            <div className="mc-val">{guestStats.deleted.toLocaleString()}</div>
          </div>
        </div>
      ) : (
        <div className="metric-row">
          <div className="mc">
            <div className="mc-label"><i className="ti ti-users"></i> Total Users</div>
            <div className="mc-val">{stats.total.toLocaleString()}</div>
          </div>
          <div className="mc">
            <div className="mc-label"><i className="ti ti-user-check"></i> Active</div>
            <div className="mc-val">{stats.active.toLocaleString()}</div>
          </div>
          <div className="mc">
            <div className="mc-label"><i className="ti ti-user-off"></i> Deactivated</div>
            <div className="mc-val">{stats.deactivated.toLocaleString()}</div>
          </div>
          <div className="mc">
            <div className="mc-label"><i className="ti ti-shield-cog"></i> Staff &amp; Admins</div>
            <div className="mc-val">{stats.staff.toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="card um-toolbar-card">
        <div className="um-toolbar">
          <div className="um-search-wrap">
            <i className="ti ti-search um-search-icon"></i>
            <input
              id="users-search"
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="um-filter-input um-search-input"
            />
          </div>
          <div className="um-filters">
            {activeTab === 'guests' ? (
              <select
                id="users-guest-status-filter"
                value={guestStatusFilter}
                onChange={(e) => setGuestStatusFilter(e.target.value)}
                className="um-filter-input"
              >
                <option value="">All guests</option>
                <option value="active">Active</option>
                <option value="deleted">Deleted (recoverable)</option>
              </select>
            ) : (
              <select
                id="users-role-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="um-filter-input"
              >
                <option value="">All roles</option>
                <option value="super_admin">Owner</option>
                <option value="manager">Supervisor</option>
                <option value="staff">Staff</option>
                <option value="user">User</option>
              </select>
            )}
            {hasActiveFilters && (
              <button type="button" className="um-clear-btn" onClick={clearFilters}>
                <i className="ti ti-x"></i> Clear
              </button>
            )}
            {activeTab === 'all' && (
              <button className="btn-teal um-add-btn" onClick={openAddUser}>
                <i className="ti ti-plus"></i> Add User
              </button>
            )}
            {activeTab === 'guests' && (
              <button className="um-add-btn" disabled={cleaningUp} onClick={runCleanupNow}>
                <i className="ti ti-trash-x"></i> {cleaningUp ? 'Running…' : 'Run cleanup now'}
              </button>
            )}
          </div>
        </div>
        <div className="um-results-row">
          {loading
            ? 'Loading…'
            : activeTab === 'guests'
            ? `${users.length.toLocaleString()} guest${users.length === 1 ? '' : 's'} found`
            : `${users.length.toLocaleString()} user${users.length === 1 ? '' : 's'} found`}
        </div>
      </div>

      <div className="card card-flush">
        <DataTable
          columns={columns}
          rows={loadError ? [] : users}
          loading={loading}
          emptyMessage={
            loadError ? 'Failed to load users.' : activeTab === 'guests' ? 'No guest accounts match your filters.' : 'No users match your filters.'
          }
          getRowKey={(u) => u._id}
        />
      </div>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} assignableRoles={assignableRoles} onCreated={fetchUsers} />
      <RoleChangeModal user={roleChangeTarget} assignableRoles={assignableRoleChanges} onClose={() => setRoleChangeTarget(null)} onSaved={fetchUsers} />
      <RecoverGuestModal user={recoverTarget} onClose={() => setRecoverTarget(null)} onRecovered={fetchUsers} />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

function AddUserModal({ open, onClose, assignableRoles, onCreated }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const passwordChecks = PASSWORD_REQUIREMENTS.map((req) => ({ ...req, met: req.test(password) }));
  const passwordValid = passwordChecks.every((c) => c.met);

  useEffect(() => {
    if (open) {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole(assignableRoles[0] || '');
      setError('');
    }
  }, [open, assignableRoles]);

  async function handleSubmit() {
    setError('');
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !role) {
      setError('First name, last name, email, password, and role are required.');
      return;
    }
    if (!passwordValid) {
      setError('Password does not meet all requirements.');
      return;
    }
    setSubmitting(true);
    try {
      await usersService.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
      });
      onClose();
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add User"
      actions={
        <>
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Creating…' : 'Create User'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
          style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: "'Inter',sans-serif", outline: 'none' }}
        />
        <input
          type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)}
          style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: "'Inter',sans-serif", outline: 'none' }}
        />
        <input
          type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: "'Inter',sans-serif", outline: 'none' }}
        />
        <input
          type="text" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)}
          style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: "'Inter',sans-serif", outline: 'none' }}
        />
        <div className="aum-password-wrap">
          <PasswordInput
            id="add-user-password"
            name="password"
            placeholder="Temporary password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          >
            <PasswordRequirementsList password={password} />
          </PasswordInput>
        </div>
        <select
          value={role} onChange={(e) => setRole(e.target.value)}
          style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: "'Inter',sans-serif", outline: 'none' }}
        >
          {assignableRoles.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
          ))}
        </select>
        {error && <div style={{ color: 'var(--red)', fontSize: '.78rem' }}>{error}</div>}
      </div>
    </Modal>
  );
}

function RoleChangeModal({ user, assignableRoles, onClose, onSaved }) {
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setError('');
    }
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setError('');
    setSaving(true);
    try {
      await usersService.updateRole(user._id, role);
      onClose();
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Change Role"
      actions={
        <>
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {user && (
        <>
          <select
            value={role} onChange={(e) => setRole(e.target.value)}
            style={{ width: '100%', background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: "'Inter',sans-serif", outline: 'none' }}
          >
            {assignableRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
            ))}
          </select>
          {error && <div style={{ color: 'var(--red)', fontSize: '.78rem', marginTop: 8 }}>{error}</div>}
        </>
      )}
    </Modal>
  );
}

function RecoverGuestModal({ user, onClose, onRecovered }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setResult(null);
      setError('');
    }
  }, [user]);

  async function handleGenerate() {
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      const data = await usersService.recover(user._id);
      setResult(data);
      await onRecovered();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setResult(null);
    setError('');
    onClose();
  }

  return (
    <Modal
      open={!!user}
      onClose={handleClose}
      title="Recover Guest Account"
      actions={
        result ? (
          <button className="save-btn" onClick={handleClose}>Done</button>
        ) : (
          <>
            <button className="cancel-btn" onClick={handleClose}>Cancel</button>
            <button className="save-btn" disabled={loading} onClick={handleGenerate}>
              {loading ? 'Generating…' : 'Generate Credentials'}
            </button>
          </>
        )
      }
    >
      {user && !result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: 0 }}>
            This issues a one-time temporary email and password for <strong>{user.firstName} {user.lastName}</strong>'s
            deleted guest account. Relay them to the customer yourself — they're shown only once and can't be
            retrieved again after this window closes.
          </p>
          {error && <div style={{ color: 'var(--red)', fontSize: '.78rem' }}>{error}</div>}
        </div>
      )}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'rgba(245,165,36,.12)', border: '1px solid rgba(245,165,36,.3)', borderRadius: 8, padding: '8px 12px', fontSize: '.78rem', color: 'var(--amber)' }}>
            <i className="ti ti-alert-triangle"></i> These credentials won't be shown again — copy them now.
          </div>
          <CopyField label="Temporary email" value={result.tempEmail} />
          <CopyField label="Temporary password" value={result.tempPassword} />
          <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
            Expires {new Date(result.expiresAt).toLocaleString()}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  }

  return (
    <div>
      <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          style={{ flex: 1, background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: 'monospace', fontSize: '.8rem', outline: 'none' }}
        />
        <button type="button" className="card-action" title="Copy" onClick={handleCopy}>
          <i className={`ti ti-${copied ? 'check' : 'copy'}`}></i>
        </button>
      </div>
    </div>
  );
}

export default Users;