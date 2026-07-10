import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import PasswordRequirementsList from '../../components/PasswordRequirementsList';
import { PASSWORD_REQUIREMENTS } from '../../utils/password';


const API_BASE_URL = 'http://localhost:3000';

function displayName(admin) {
  if (!admin) return 'Admin';
  const name = `${admin.firstName || ''} ${admin.lastName || ''}`.trim();
  return name || 'Admin';
}

function initialsOf(admin) {
  if (!admin) return 'A';
  return displayName(admin).charAt(0).toUpperCase();
}

const PROFILE_METRICS = [
  { label: 'Total Logins', value: '142' },
  { label: 'Bookings Managed', value: '388' },
  { label: 'Reports Generated', value: '27' },
  { label: 'Account Created', value: 'Jan 2026' },
];

function Profile() {
  const { user: admin, updateUser } = useAuth();

  const [firstName, setFirstName] = useState(admin?.firstName || '');
  const [lastName, setLastName] = useState(admin?.lastName || '');
  const [email, setEmail] = useState(admin?.email || '');
  const [phone, setPhone] = useState(admin?.phone || '');
  const [savingDetails, setSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const passwordChecks = PASSWORD_REQUIREMENTS.map((req) => ({ ...req, met: req.test(newPassword) }));
  const passwordValid = passwordChecks.every((c) => c.met);

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
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();
    setSavingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${admin._id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // email intentionally omitted — see file-header note.
        body: JSON.stringify({ firstName: trimmedFirstName, lastName: trimmedLastName, phone: trimmedPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update your profile.');

      setFirstName(trimmedFirstName);
      setLastName(trimmedLastName);
      setPhone(trimmedPhone);

      // updateUser() both updates the shared AuthContext `user` (so
      // AdminSidebar's name reflects this immediately) and writes the
      // merged object back to whichever storage already held it — see the
      // PHASE 11 CHANGE note above.
      updateUser({ firstName: trimmedFirstName, lastName: trimmedLastName, phone: trimmedPhone });
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
    if (!passwordValid) return alert('New password does not meet all requirements.');
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
          <div className="profile-name" id="profile-fullname">{displayName(admin)}</div>
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
            <input type="text" id="profile-firstname-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="pfield">
            <label>Last name</label>
            <input type="text" id="profile-lastname-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
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
            <PasswordInput
              id="profile-current-password"
              name="currentPassword"
              placeholder="Enter current password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="pfield">
            <label>New password</label>
            <PasswordInput
              id="profile-new-password"
              name="newPassword"
              placeholder="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            >
              <PasswordRequirementsList password={newPassword} />
            </PasswordInput>
          </div>
          <div className="pfield">
            <label>Confirm new password</label>
            <PasswordInput
              id="profile-confirm-password"
              name="confirmPassword"
              placeholder="Confirm password"
              autoComplete="new-password"
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