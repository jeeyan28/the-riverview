import { useCallback, useEffect, useRef, useState } from 'react';
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

function Users() {
  const { initializing, guardPermission } = useAuth();
  const { confirm, confirmProps } = useConfirm();

  /* ── filters ── */
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const searchDebounce = useRef(null);

  /* ── data ── */
  const [users, setUsers] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  /* ── modals ── */
  const [addOpen, setAddOpen] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState(null); // the user row, or null

  const fetchUsers = useCallback(async () => {
    // Waits on `initializing` (see AuthContext) rather than checking
    // admin:manage immediately: hasPermission()/guardPermission() read
    // `user.permissions`, which isn't trustworthy until the initial
    // GET /api/auth/me revalidation resolves — checking earlier could show
    // a false "no permission" alert to a legitimate admin:manage user on a
    // hard refresh, before their real permissions have loaded.
    if (initializing) return;
    // Direct port of renderUsersPanel()'s guardPermission('admin:manage', ...)
    // — re-checked on every call, same as the original (initial load,
    // search, and role-filter changes all funnel through this function).
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

  // Search is debounced 300ms, same as the original's debounce(renderUsersPanel, 300).
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(fetchUsers, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Direct port of openAddUserModal()'s guard.
  function openAddUser() {
    if (!guardPermission('admin:manage', "You don't have permission to manage users.")) return;
    setAddOpen(true);
  }

  /* ── row actions ── */
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
    { key: 'name', label: 'Name', render: (u) => `${u.firstName} ${u.lastName}` },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Role',
      render: (u) => <span className={`pill ${ROLE_BADGE_CLASS[u.role] || 'pill-done'}`}>{u.roleLabel || ROLE_LABELS[u.role] || u.role}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (u.isActive ? <span className="pill pill-active">Active</span> : <span className="pill pill-overdue">Deactivated</span>),
    },
    {
      key: 'lastLoginAt',
      label: 'Last Login',
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
      <div className="card">
        <div className="card-head">
          <span className="card-title">Manage Users</span>
          <button className="card-action" onClick={openAddUser}>
            <i className="ti ti-plus"></i> Add User
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            id="users-search"
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: '.82rem', fontFamily: "'Inter',sans-serif", outline: 'none' }}
          />
          <select
            id="users-role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: '.82rem', fontFamily: "'Inter',sans-serif", outline: 'none' }}
          >
            <option value="">All roles</option>
            <option value="super_admin">Owner</option>
            <option value="manager">Supervisor</option>
            <option value="staff">Staff</option>
            <option value="user">User</option>
          </select>
        </div>
        <DataTable
          columns={columns}
          rows={loadError ? [] : users}
          loading={loading}
          emptyMessage={loadError ? 'Failed to load users.' : 'No users found.'}
          getRowKey={(u) => u._id}
        />
      </div>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} assignableRoles={assignableRoles} onCreated={fetchUsers} />
      <RoleChangeModal user={roleChangeTarget} assignableRoles={assignableRoles} onClose={() => setRoleChangeTarget(null)} onSaved={fetchUsers} />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AddUserModal — page-specific/single-use, same reasoning as Bookings.jsx's
// ManualBookingModal/EditBookingModal (components/README.md's Modal.jsx
// notes). Keeps the original's inline error div (um-error) instead of
// alert(), since the original distinguished "validation problem, fix and
// retry without losing your other fields" (inline) from "action already
// happened, just acknowledge it" (alert, used for status/delete above).
// ─────────────────────────────────────────────────────────────────────────
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

  // Reset the form and default the role select whenever the modal (re)opens,
  // matching openAddUserModal()'s field-clearing in the original.
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

// ─────────────────────────────────────────────────────────────────────────
// RoleChangeModal — page-specific/single-use, same reasoning as above.
// `user` is the live row passed in from Users()'s own `users` state, so
// re-opening it always reflects the current role/canManage state.
// ─────────────────────────────────────────────────────────────────────────
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