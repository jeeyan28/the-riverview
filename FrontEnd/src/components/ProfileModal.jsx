import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────
// ProfileModal — migrated from index.html's #profileModal markup (`.pf-*`
// classes) + js/index.js's "PROFILE MODAL" section (getStorageArea,
// saveStoredUser, pfShowToast, pfSetError, pfRenderUser, openProfileModal,
// closeProfileModal, pfSwitchTab, initProfileModal — original lines
// ~1203–1356) — Home page, Phase 8, part 3 of 3.
//
// This is a controlled component, same pattern as <BookingModal/>: the
// parent (MainLayout, see decision note below) owns whether it's open via
// `open`/`onClose` props. The overlay div is always mounted (matching the
// original's always-in-DOM #profileModal, hidden via `display:none` until
// `.open` is added) so the existing pfFadeIn/pfSlideUp CSS animations still
// play correctly — same reasoning as BookingModal's header comment.
//
// WHERE THIS LIVES (decision for this phase): rendered from MainLayout.jsx,
// not Home.jsx. The original comment in Home.jsx said the profile modal is
// "opened from the user-chip menu in <Navbar/>" — and Navbar is rendered by
// MainLayout, not Home. Home.jsx is just one of possibly several pages
// MainLayout wraps, and the user-chip (with its "My Profile" button) is
// part of the header that appears on all of them. Putting the modal here
// means any current or future MainLayout page gets working profile access
// for free, without each page needing to import/mount it itself — exactly
// the same reasoning MainLayout already uses for owning Navbar's
// theme/promo/mobile-nav state.
//
// Auth notes (still local to this component, not AuthContext — that's
// Phase 10, per the same note in BookingModal.jsx): getStoredUser/
// verifySession/logoutUser below are copied from the same-named functions
// in the original js/index.js. This duplicates a few lines already inlined
// in Login.jsx/Register.jsx/ResetPassword.jsx/BookingModal.jsx; per
// hooks/README.md and utils/README.md, de-duplicating this into a shared
// useAuth hook is intentionally deferred to Phase 10 rather than built
// speculatively now.
//
// DEVIATION from the original (intentional improvement, not a fidelity
// gap): the original's pfDetailsForm submit handler ignored the PUT
// /users/:id response body and optimistically merged the *locally typed*
// values into the stored user. Backend/routes/userRoutes.js's PUT /:id
// handler actually returns the full updated user object (shapeUser(target))
// on success, so this version merges that server response instead — same
// end result when the save succeeds, but now also correctly reflects any
// server-side normalization instead of just echoing back what was typed.
//
// API_BASE_URL is still hardcoded, matching every other page pre-Phase 9.
// ─────────────────────────────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000';
const USER_KEY = 'riverview_user';

function getStorageArea() {
  return localStorage.getItem(USER_KEY) ? localStorage : sessionStorage;
}

function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStoredUser(user) {
  getStorageArea().setItem(USER_KEY, JSON.stringify(user));
}

// verifySession — migrated 1:1 from js/index.js (also duplicated in
// BookingModal.jsx). Confirms with the server whether the session cookie
// is still valid, keeping whichever storage area currently holds the user
// in sync with the answer.
async function verifySession() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
      return null;
    }
    const data = await res.json();
    const area = localStorage.getItem(USER_KEY) ? localStorage : sessionStorage;
    area.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  } catch (err) {
    return getStoredUser();
  }
}

async function logoutUser() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('Logout request failed:', err);
  }
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.location.href = '/';
}

const EMPTY_DETAILS = { firstname: '', lastname: '', phone: '', email: '' };

function ProfileModal({ open, onClose }) {
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [savingDetails, setSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ current: false, new: false, confirm: false });
  const [savingPassword, setSavingPassword] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const toastTimer = useRef(null);

  function pfShowToast(message, type = 'success') {
    setToast({ visible: true, message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3200);
  }

  function pfRenderUser(u) {
    setDetails({
      firstname: u.firstname || '',
      lastname: u.lastname || '',
      phone: u.phone || '',
      email: u.email || '',
    });
  }

  // openProfileModal — same guard as the original: no session, no modal.
  // Runs each time `open` flips true (mirrors the original being called
  // fresh from the user-chip menu click every time).
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      const freshUser = (await verifySession()) || getStoredUser();
      if (cancelled) return;
      if (!freshUser) {
        onClose?.();
        navigate('/login');
        return;
      }
      setUser(freshUser);
      pfRenderUser(freshUser);
      setActiveTab('details');
      setFieldErrors({ current: false, new: false, confirm: false });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Body scroll lock while open — matches the original's
  // document.body.style.overflow toggling in openProfileModal/closeProfileModal.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  function handleClose() {
    onClose?.();
  }

  async function handleDetailsSubmit(e) {
    e.preventDefault();
    if (!user) return;

    const firstname = details.firstname.trim();
    const lastname = details.lastname.trim();
    const phone = details.phone.trim();

    setSavingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${user._id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstname, lastname, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update your profile.');

      // See header comment: the server response (shapeUser(target)) is the
      // source of truth here, not just the locally typed values.
      const updated = { ...user, ...data };
      setUser(updated);
      saveStoredUser(updated);
      pfRenderUser(updated);
      // Keep AuthContext's shared `user` (what Navbar's chip reads) in sync
      // immediately, instead of only writing to storage — otherwise the
      // navbar chip name/avatar doesn't refresh until the next full
      // /api/auth/me revalidation (e.g. a page reload).
      updateUser(data);
      pfShowToast('Profile updated.');
    } catch (err) {
      pfShowToast(err.message || 'Could not reach the server.', 'error');
    } finally {
      setSavingDetails(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (!user) return;

    const currentOk = currentPassword.length > 0;
    const newOk = newPassword.length >= 8;
    const matchOk = newPassword === confirmPassword && confirmPassword.length > 0;

    setFieldErrors({ current: !currentOk, new: !newOk, confirm: !matchOk });
    if (!currentOk || !newOk || !matchOk) return;

    setSavingPassword(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${user._id}/password`, {
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
      pfShowToast('Password updated.');
    } catch (err) {
      pfShowToast(err.message || 'Could not reach the server.', 'error');
    } finally {
      setSavingPassword(false);
    }
  }

  const initial = (details.firstname || user?.email || 'U').trim().charAt(0).toUpperCase() || 'U';

  return (
    <>
      <div
        className={`pf-overlay${open ? ' open' : ''}`}
        id="profileModal"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <div className="pf-modal">
          <button className="pf-close" id="pfClose" aria-label="Close" onClick={handleClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>

          <div className="pf-header">
            <div className="pf-avatar" id="pfAvatar">{initial}</div>
            <div>
              <div className="pf-eyebrow">My Account</div>
              <h2 id="pfGreeting">Hi, {details.firstname || 'there'}</h2>
              <p className="pf-email" id="pfEmail">{details.email}</p>
            </div>
          </div>

          <div className="pf-tabs">
            <button
              type="button"
              className={`pf-tab${activeTab === 'details' ? ' active' : ''}`}
              data-pftab="details"
              onClick={() => setActiveTab('details')}
            >
              Profile details
            </button>
            <button
              type="button"
              className={`pf-tab${activeTab === 'password' ? ' active' : ''}`}
              data-pftab="password"
              onClick={() => setActiveTab('password')}
            >
              Change password
            </button>
          </div>

          {/* DETAILS */}
          <form
            className={`pf-panel${activeTab === 'details' ? ' active' : ''}`}
            id="pfDetailsForm"
            noValidate
            onSubmit={handleDetailsSubmit}
          >
            <div className="pf-row">
              <div className="pf-field">
                <label htmlFor="pfFirstname">First name</label>
                <input
                  type="text"
                  id="pfFirstname"
                  placeholder="First name"
                  value={details.firstname}
                  onChange={(e) => setDetails((d) => ({ ...d, firstname: e.target.value }))}
                />
              </div>
              <div className="pf-field">
                <label htmlFor="pfLastname">Last name</label>
                <input
                  type="text"
                  id="pfLastname"
                  placeholder="Last name"
                  value={details.lastname}
                  onChange={(e) => setDetails((d) => ({ ...d, lastname: e.target.value }))}
                />
              </div>
            </div>
            <div className="pf-field">
              <label htmlFor="pfPhone">Phone number</label>
              <input
                type="tel"
                id="pfPhone"
                placeholder="09XX XXX XXXX"
                value={details.phone}
                onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
              />
            </div>
            <div className="pf-field">
              <label htmlFor="pfEmailReadonly">Email address</label>
              <input type="email" id="pfEmailReadonly" value={details.email} disabled readOnly />
            </div>
            <button
              type="submit"
              className={`pf-submit${savingDetails ? ' loading' : ''}`}
              id="pfSaveDetailsBtn"
              disabled={savingDetails}
            >
              <span className="pf-btn-text">Save changes</span>
              <span className="pf-spinner"></span>
            </button>
          </form>

          {/* PASSWORD */}
          <form
            className={`pf-panel${activeTab === 'password' ? ' active' : ''}`}
            id="pfPasswordForm"
            noValidate
            onSubmit={handlePasswordSubmit}
          >
            <div className={`pf-field${fieldErrors.current ? ' has-error' : ''}`} id="pfFieldCurrent">
              <label htmlFor="pfCurrentPassword">Current password</label>
              <input
                type="password"
                id="pfCurrentPassword"
                placeholder="Enter current password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setFieldErrors((f) => ({ ...f, current: false }));
                }}
              />
              <span className="pf-error">Enter your current password.</span>
            </div>
            <div className={`pf-field${fieldErrors.new ? ' has-error' : ''}`} id="pfFieldNew">
              <label htmlFor="pfNewPassword">New password</label>
              <input
                type="password"
                id="pfNewPassword"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setFieldErrors((f) => ({ ...f, new: false }));
                }}
              />
              <span className="pf-error">Password must be at least 8 characters.</span>
            </div>
            <div className={`pf-field${fieldErrors.confirm ? ' has-error' : ''}`} id="pfFieldConfirm">
              <label htmlFor="pfConfirmPassword">Confirm new password</label>
              <input
                type="password"
                id="pfConfirmPassword"
                placeholder="Re-enter new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFieldErrors((f) => ({ ...f, confirm: false }));
                }}
              />
              <span className="pf-error">Passwords don't match.</span>
            </div>
            <button
              type="submit"
              className={`pf-submit${savingPassword ? ' loading' : ''}`}
              id="pfSavePasswordBtn"
              disabled={savingPassword}
            >
              <span className="pf-btn-text">Update password</span>
              <span className="pf-spinner"></span>
            </button>
          </form>

          <button type="button" className="pf-logout" id="pfLogoutBtn" onClick={logoutUser}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i>Log out
          </button>
        </div>
      </div>

      <div className={`pf-toast${toast.visible ? ' show' : ''}${toast.type === 'error' ? ' error' : ''}`} id="pfToast">
        <span id="pfToastIcon">{toast.type === 'error' ? '⚠️' : '✅'}</span>
        <span id="pfToastMsg">{toast.message}</span>
      </div>
    </>
  );
}

export default ProfileModal;