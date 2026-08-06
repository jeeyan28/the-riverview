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
  const searchDebounce = useRef(null);

  const [users, setUsers] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [assignableRoleChanges, setAssignableRoleChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState(null);

  const fetchUsers = useCallback(async () => {
    if (initializing) return;
    if (!guardPermission('admin:manage', "You don't have permission to manage users.")) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const data = await usersService.list({ search: search.trim(), role: roleFilter });
      setUsers(Array.isArray(data.users) ? data.users : []);
      setAssignableRoles(Array.isArray(data.assignableRoles) ? data.assignableRoles : []);
      setAssignableRoleChanges(Array.isArray(data.assignableRoleChanges) ? data.assignableRoleChanges : []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, initializing]);

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, initializing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(fetchUsers, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchDebounce.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.isActive).length,
      deactivated: users.filter((u) => !u.isActive).length,
      staff: users.filter((u) => u.role !== 'user').length,
    }),
    [users]
  );

  function openAddUser() {
    if (!guardPermission('admin:manage', "You don't have permission to manage users.")) return;
    setAddOpen(true);
  }

  function clearFilters() {
    setSearch('');
    setRoleFilter('');
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

  async function deleteUser(user) {
    if (!(await confirm(`Permanently delete ${user.firstName} ${user.lastName}? This cannot be undone.`, { danger: true, confirmText: 'Delete' }))) return;
    try {
      await usersService.remove(user._id);
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  const columns = [
    {
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
    },
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
    {
      key: 'lastLoginAt',
      label: 'Last Login',
      sortable: true,
      sortValue: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0),
      render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'),
    },
    {
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
    },
  ];

  return (
    <div className="panel active" id="panel-users">
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
            {(search || roleFilter) && (
              <button type="button" className="um-clear-btn" onClick={clearFilters}>
                <i className="ti ti-x"></i> Clear
              </button>
            )}
            <button className="btn-teal um-add-btn" onClick={openAddUser}>
              <i className="ti ti-plus"></i> Add User
            </button>
          </div>
        </div>
        <div className="um-results-row">
          {loading ? 'Loading users…' : `${users.length.toLocaleString()} user${users.length === 1 ? '' : 's'} found`}
        </div>
      </div>

      <div className="card card-flush">
        <DataTable
          columns={columns}
          rows={loadError ? [] : users}
          loading={loading}
          emptyMessage={loadError ? 'Failed to load users.' : 'No users match your filters.'}
          getRowKey={(u) => u._id}
        />
      </div>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} assignableRoles={assignableRoles} onCreated={fetchUsers} />
      <RoleChangeModal user={roleChangeTarget} assignableRoles={assignableRoleChanges} onClose={() => setRoleChangeTarget(null)} onSaved={fetchUsers} />

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

export default Users;