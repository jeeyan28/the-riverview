import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────
// Admin / Profile — migrated from admin.html's <div id="panel-profile">.
// Part of Phase 9 (Page Migration continues past Phase 8's admin panels).
// Phase 11 update: now consumes AuthContext instead of reading
// localStorage/sessionStorage directly — see the "PHASE 11" note below for
// exactly what changed and why the original approach was confirmed safe
// first.
//
// IMPORTANT DISCOVERY — unlike Settings' Pricing/Promotion/Audit Log tabs
// (Phase 8, part 10e) or Reports.jsx, this panel is NOT static. admin.js
// itself has zero profile-related code (grepping it for any profile-*
// element ID returns nothing), which could look like another
// Reports.jsx-style honest-static-port situation — but admin.html actually
// loads a SECOND script the earlier Settings/Reports investigation hadn't
// needed to check: <script src="js/admin-profile.js">, right after
// admin.js (see admin.html's closing script tags). That file has real,
// working fetch wiring:
//   - Reads the logged-in admin from localStorage/sessionStorage under the
//     key 'riverview_user' (getStoredAdmin/getStorageArea) — the exact
//     same key this migrated app's own Login.jsx already writes to on
//     successful login (see Login.jsx's storage.setItem('riverview_user',
//     ...) calls), so that data is already available here with no new
//     plumbing.
//   - PUT /api/users/:id with { firstname, lastname, phone } for "Save
//     changes" (Backend/routes/userRoutes.js's router.put("/:id", ...) —
//     confirmed it only reads firstname/lastname/phone off req.body, email
//     is accepted by nothing there).
//   - PUT /api/users/:id/password with { currentPassword, newPassword }
//     for "Update password" (same file's router.put("/:id/password", ...)
//     — requires currentPassword since editing your own account always
//     hits the isSelf branch there).
// Both routes require ensureAuthenticated (session cookie), so — unlike
// admin-profile.js's original fetch calls, which omitted credentials
// because admin.html and the API were served same-origin — these use
// credentials:'include', matching every other fetch in this migrated app
// (Vite dev server and the API are cross-origin).
//
// The email field is a legacy quirk worth calling out: admin.html renders
// it as a normal editable text input, and admin-profile.js does pre-fill
// it from the stored admin — but its save handler never puts email in the
// PUT body, and the backend route doesn't accept it if it did. So in the
// original, typing a new email into that field and clicking "Save
// changes" silently does nothing to it. That's reproduced faithfully here
// (the input stays editable, matching the original's actual behavior,
// but its value is intentionally excluded from the save request) rather
// than either disabling the field (which the original never did) or
// quietly adding new backend support for changing email (which doesn't
// exist).
//
// profile-role ("Super Admin · The Riverview") is a second legacy quirk:
// admin-profile.js's renderAdminIdentity() updates profile-fullname,
// profile-av, profile-meta-email, profile-meta-phone, and the four form
// inputs from the stored admin object — but it never touches
// #profile-role. That element keeps whatever static text admin.html
// shipped with, forever, regardless of the logged-in admin's actual role.
// Reproduced here as literal static text for the same reason — this is
// the original's real behavior, not an oversight to silently fix.
//
// The metric-row (Total Logins / Bookings Managed / Reports Generated /
// Account Created) IS static/decorative, same situation as Reports.jsx:
// neither admin.js nor admin-profile.js references any of the mc-val
// elements on this row, and no Backend route shapes a
// logins-count/reports-count payload. Ported as an honest straight copy
// of admin.html's hardcoded numbers.
//
// ── PHASE 11 CHANGE ──────────────────────────────────────────────────────
// Before changing anything, confirmed this page's pre-Phase-11 approach
// (its own getStoredAdmin()/saveStoredAdmin() reading/writing
// 'riverview_user' directly) still worked correctly — it did; nothing here
// was broken. The change is purely to remove a second, independent
// keeper of "who is logged in" now that one exists:
//   - Identity (`admin`) now comes from AuthContext's `user` instead of a
//     local getStoredAdmin() read. AuthContext already revalidates against
//     GET /api/auth/me on mount (see its header comment), so this page now
//     benefits from that instead of trusting a cached value that could be
//     stale (e.g. after a role change) the way the old direct-localStorage
//     read always did.
//   - After a successful "Save changes", this page now calls
//     AuthContext's updateUser({ firstname, lastname, phone }) instead of
//     its own saveStoredAdmin(). updateUser() both updates the shared
//     `user` object AND writes it back to whichever storage already held
//     it (same "localStorage if remember-me, else sessionStorage" rule
//     saveStoredAdmin() used) — so storage stays in sync exactly as
//     before, but through one shared function instead of two independent
//     copies of the same logic.
//   - This also finally fixes the one gap called out below in the original
//     header note: since AdminSidebar.jsx now reads the same AuthContext
//     `user` (wired in this same phase), a name/phone change saved here is
//     reflected in the sidebar immediately, with no extra plumbing needed
//     between this page and that component.
//
// Still not reproduced, and still fine to leave that way: admin-profile.js's
// redirect-to-login.html when no stored admin is found, and its own
// #admin-logout-btn handler — both are now AdminLayout.jsx's/
// AdminSidebar.jsx's job respectively (route guard + shared logout()),
// wired this same phase, so this page doesn't need its own copy of either.
// ─────────────────────────────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000';

function fullName(admin) {
  if (!admin) return 'Admin';
  return [admin.firstname, admin.lastname].filter(Boolean).join(' ') || admin.name || 'Admin';
}

function initialsOf(admin) {
  if (!admin) return 'A';
  const initials = (admin.firstname?.[0] || '') + (admin.lastname?.[0] || '');
  return (initials || fullName(admin).charAt(0)).toUpperCase();
}

const PROFILE_METRICS = [
  { label: 'Total Logins', value: '142' },
  { label: 'Bookings Managed', value: '388' },
  { label: 'Reports Generated', value: '27' },
  { label: 'Account Created', value: 'Jan 2026' },
];

function Profile() {
  const { user: admin, updateUser } = useAuth();

  const [firstname, setFirstname] = useState(admin?.firstname || '');
  const [lastname, setLastname] = useState(admin?.lastname || '');
  const [email, setEmail] = useState(admin?.email || '');
  const [phone, setPhone] = useState(admin?.phone || '');
  const [savingDetails, setSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleSaveDetails() {
    if (!admin?._id) return;
    // Direct port of admin-profile.js's save handler, which reads each
    // field via .trim() before sending and before writing back to storage
    // (saveStoredAdmin) / re-rendering the inputs (renderAdminIdentity) —
    // so the original always normalizes trailing/leading whitespace, both
    // server-side and on-screen. Trim here too, and reflect the trimmed
    // values back into local state after a successful save so the inputs
    // match what was actually saved (equivalent to the original's
    // renderAdminIdentity() re-setting each input's .value from the
    // trimmed, saved object).
    const trimmedFirstname = firstname.trim();
    const trimmedLastname = lastname.trim();
    const trimmedPhone = phone.trim();
    setSavingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${admin._id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // email intentionally omitted — see file-header note.
        body: JSON.stringify({ firstname: trimmedFirstname, lastname: trimmedLastname, phone: trimmedPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update your profile.');

      setFirstname(trimmedFirstname);
      setLastname(trimmedLastname);
      setPhone(trimmedPhone);

      // updateUser() both updates the shared AuthContext `user` (so
      // AdminSidebar's name reflects this immediately) and writes the
      // merged object back to whichever storage already held it — see the
      // PHASE 11 CHANGE note above.
      updateUser({ firstname: trimmedFirstname, lastname: trimmedLastname, phone: trimmedPhone });
      alert('Profile updated.');
    } catch (err) {
      alert(err.message || 'Could not reach the server. Is it running?');
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleSavePassword() {
    if (!admin?._id) return;
    if (!currentPassword) return alert('Enter your current password.');
    if (newPassword.length < 8) return alert('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return alert("New password and confirmation don't match.");

    setSavingPassword(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${admin._id}/password`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update your password.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Password updated.');
    } catch (err) {
      alert(err.message || 'Could not reach the server. Is it running?');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="panel active" id="panel-profile">
      <div className="profile-hero">
        <div className="profile-av" id="profile-av">{initialsOf(admin)}</div>
        <div>
          <div className="profile-name" id="profile-fullname">{fullName(admin)}</div>
          {/* Static text — the original never wires this to the logged-in
              admin's real role either. See file-header note. */}
          <div className="profile-role" id="profile-role">Super Admin · The Riverview</div>
          <div className="profile-meta">
            <span className="pmeta"><i className="ti ti-mail"></i><span id="profile-meta-email">{admin?.email || ''}</span></span>
            <span className="pmeta"><i className="ti ti-phone"></i><span id="profile-meta-phone">{admin?.phone || ''}</span></span>
            <span className="pmeta"><i className="ti ti-map-pin"></i>San Rafael, Bulacan</span>
          </div>
        </div>
      </div>

      <div className="p2col">
        <div className="card">
          <div className="card-head"><span className="card-title">Personal information</span></div>
          <div className="pfield">
            <label>First name</label>
            <input type="text" id="profile-firstname" value={firstname} onChange={(e) => setFirstname(e.target.value)} />
          </div>
          <div className="pfield">
            <label>Last name</label>
            <input type="text" id="profile-lastname" value={lastname} onChange={(e) => setLastname(e.target.value)} />
          </div>
          <div className="pfield">
            <label>Email address</label>
            <input type="email" id="profile-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="pfield">
            <label>Phone number</label>
            <input type="tel" id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button
            className="save-btn"
            id="profile-save-details-btn"
            style={{ marginTop: 6 }}
            type="button"
            disabled={savingDetails}
            onClick={handleSaveDetails}
          >
            {savingDetails ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">Change password</span></div>
          <div className="pfield">
            <label>Current password</label>
            <input
              type="password"
              id="profile-current-password"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="pfield">
            <label>New password</label>
            <input
              type="password"
              id="profile-new-password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="pfield">
            <label>Confirm new password</label>
            <input
              type="password"
              id="profile-confirm-password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button
            className="save-btn"
            id="profile-save-password-btn"
            style={{ marginTop: 6 }}
            type="button"
            disabled={savingPassword}
            onClick={handleSavePassword}
          >
            {savingPassword ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </div>

      <div className="metric-row">
        {PROFILE_METRICS.map((m) => (
          <div className="mc" key={m.label}>
            <div className="mc-label">{m.label}</div>
            <div className="mc-val" style={m.label === 'Account Created' ? { fontSize: '1rem' } : undefined}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Profile;