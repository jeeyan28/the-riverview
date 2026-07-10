import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { bookingsService } from '../services/bookings';
import PasswordInput from './PasswordInput';
import { PASSWORD_REQUIREMENTS } from '../utils/password';

// ProfileModal — controlled modal (open/onClose props), rendered from
// MainLayout so it's available on every page via the Navbar user-chip.
// Segmented tabs: "Profile" (details + change password, session-based
// accounts only) and "Booking history". Session state/verification comes
// from AuthContext (useAuth) — see that file for revalidate()/logout().

const API_BASE_URL = 'http://localhost:3000';

const EMPTY_DETAILS = { firstName: '', lastName: '', phone: '', email: '' };
const EMPTY_PASSWORD = { currentPassword: '', newPassword: '', confirmPassword: '' };

// Buckets the booking model's various statuses into the 3 chip colors
// from the reference design (completed / upcoming / cancelled).
function historyStatusClass(status) {
  if (['Confirmed', 'Active', 'Done'].includes(status)) return 'completed';
  if (['Rejected', 'Cancelled', 'Overdue'].includes(status)) return 'cancelled';
  return 'upcoming';
}

function ProfileModal({ open, onClose }) {
  const navigate = useNavigate();
  const { user: authUser, revalidate, updateUser, logout } = useAuth();

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [savingDetails, setSavingDetails] = useState(false);

  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD);
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingsError, setBookingsError] = useState('');

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const toastTimer = useRef(null);

  function pfShowToast(message, type = 'success') {
    setToast({ visible: true, message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3200);
  }

  function pfRenderUser(u) {
    setDetails({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
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
      const freshUser = (await revalidate()) || authUser;
      if (cancelled) return;
      if (!freshUser) {
        onClose?.();
        navigate('/login');
        return;
      }
      setUser(freshUser);
      pfRenderUser(freshUser);
      setActiveTab('profile');
      setPasswordForm(EMPTY_PASSWORD);
      setPasswordError('');
      setBookingsError('');
      setLoadingBookings(true);
      try {
        const data = await bookingsService.mine();
        if (!cancelled) setBookings(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setBookingsError(err.message || 'Could not load your bookings.');
      } finally {
        if (!cancelled) setLoadingBookings(false);
      }
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

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  async function handleDetailsSubmit(e) {
    e.preventDefault();
    if (!user) return;

    const firstName = details.firstName.trim();
    const lastName = details.lastName.trim();
    const phone = details.phone.trim();

    setSavingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${user._id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update your profile.');

      // See header comment: the server response (shapeUser(target)) is the
      // source of truth here, not just the locally typed values.
      const updated = { ...user, ...data };
      setUser(updated);
      pfRenderUser(updated);
      // Keep AuthContext's shared `user` (what Navbar's chip reads) in sync
      // immediately, instead of only writing to storage — updateUser()
      // handles both the context state and the storage write.
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

    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    setPasswordError('');

    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (!isNewPasswordValid) {
      setPasswordError('New password does not meet all requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${user._id}/password`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not change your password.');

      setPasswordForm(EMPTY_PASSWORD);
      pfShowToast('Password changed.');
    } catch (err) {
      setPasswordError(err.message || 'Could not reach the server.');
    } finally {
      setSavingPassword(false);
    }
  }

  const initial = (details.firstName || user?.email || 'U').trim().charAt(0).toUpperCase() || 'U';
  const isGoogleAccount = !!user?.isGoogleAccount;

  const passwordChecks = PASSWORD_REQUIREMENTS.map((req) => ({ ...req, met: req.test(passwordForm.newPassword) }));
  const isNewPasswordValid = passwordChecks.every((c) => c.met);

  const completedBookings = bookings.filter((b) => historyStatusClass(b.status) === 'completed');
  const totalSpent = completedBookings.reduce((sum, b) => sum + Number(b.amount || 0), 0);

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
          <div className="pf-modal-head">
            <h2 className="pf-modal-title">My profile</h2>
            <button className="pf-close" id="pfClose" aria-label="Close" onClick={handleClose}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div className="pf-tabs" role="tablist">
            <button
              type="button"
              className={`pf-tab${activeTab === 'profile' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            <button
              type="button"
              className={`pf-tab${activeTab === 'history' ? ' active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
            >
              Booking history
            </button>
          </div>

          <div className={`pf-panel${activeTab === 'profile' ? ' active' : ''}`}>
            <div className="pf-profile-body">
              <div className="pf-avatar-col">
                <div className="pf-avatar" id="pfAvatar">
                  {user?.profilePicture ? (
                    <img src={user.profilePicture} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    initial
                  )}
                </div>
                {/* Static — no photo-upload endpoint wired up yet. */}
                <button
                  type="button"
                  className="pf-edit-btn"
                  onClick={() => pfShowToast('Photo upload is coming soon.', 'error')}
                >
                  <i className="fa-solid fa-camera"></i>
                  Edit
                </button>
              </div>

              <form id="pfDetailsForm" noValidate className="pf-fields" onSubmit={handleDetailsSubmit}>
                {isGoogleAccount && (
                  <p className="pf-history-empty">Your name is managed by your Google account.</p>
                )}
                <div className="pf-field">
                  <label htmlFor="pfFirstName">First name</label>
                  <input
                    type="text"
                    id="pfFirstName"
                    placeholder="First name"
                    value={details.firstName}
                    disabled={isGoogleAccount}
                    onChange={(e) => setDetails((d) => ({ ...d, firstName: e.target.value }))}
                  />
                </div>
                <div className="pf-field">
                  <label htmlFor="pfLastName">Last name</label>
                  <input
                    type="text"
                    id="pfLastName"
                    placeholder="Last name"
                    value={details.lastName}
                    disabled={isGoogleAccount}
                    onChange={(e) => setDetails((d) => ({ ...d, lastName: e.target.value }))}
                  />
                </div>
                <div className="pf-field">
                  <label htmlFor="pfEmailReadonly">Email</label>
                  <input type="email" id="pfEmailReadonly" value={details.email} disabled readOnly />
                </div>
                <div className="pf-field">
                  <label htmlFor="pfPhone">Phone number</label>
                  {/* Flag+code is static — no country field on the user model yet. */}
                  <div className="pf-phone-field">
                    <span className="pf-flag-pick">🇵🇭 +63</span>
                    <input
                      type="tel"
                      id="pfPhone"
                      placeholder="9XX XXX XXXX"
                      value={details.phone}
                      disabled={isGoogleAccount}
                      onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
                    />
                  </div>
                </div>

                {!isGoogleAccount && (
                  <div className="pf-modal-actions">
                    <button type="button" className="pf-btn pf-btn-ghost" onClick={handleClose}>
                      Close
                    </button>
                    <button
                      type="submit"
                      className={`pf-btn pf-btn-solid${savingDetails ? ' loading' : ''}`}
                      id="pfSaveDetailsBtn"
                      disabled={savingDetails}
                    >
                      <span className="pf-btn-text">Save</span>
                      <span className="pf-spinner"></span>
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* CHANGE PASSWORD — session-based accounts only; Google
                accounts authenticate through Google, not a local password.
                Not part of the reference mockup, kept as a real existing
                feature and styled to match. */}
            {!isGoogleAccount && (
              <form id="pfPasswordForm" noValidate onSubmit={handlePasswordSubmit}>
                <div className="pf-section-title pf-section-title--divider">Change password</div>
                <div className="pf-field">
                  <label htmlFor="pfCurrentPassword">Current password</label>
                  <PasswordInput
                    id="pfCurrentPassword"
                    name="currentPassword"
                    placeholder="Current password"
                    autoComplete="current-password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  />
                </div>
                <div className="pf-row">
                  <div className="pf-field">
                    <label htmlFor="pfNewPassword">New password</label>
                    <PasswordInput
                      id="pfNewPassword"
                      name="newPassword"
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                    >
                      {passwordForm.newPassword.length > 0 && !isNewPasswordValid && (
                        <ul className="password-requirements">
                          {passwordChecks
                            .filter((req) => !req.met)
                            .map((req) => (
                              <li key={req.key}>
                                <span className="requirement-dot" />
                                {req.label}
                              </li>
                            ))}
                        </ul>
                      )}
                    </PasswordInput>
                  </div>
                  <div className="pf-field">
                    <label htmlFor="pfConfirmPassword">Confirm new password</label>
                    <PasswordInput
                      id="pfConfirmPassword"
                      name="confirmPassword"
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    />
                  </div>
                </div>
                {passwordError && <p className="pf-error pf-error--standalone">{passwordError}</p>}
                <div className="pf-modal-actions">
                  <button
                    type="submit"
                    className={`pf-btn pf-btn-solid${savingPassword ? ' loading' : ''}`}
                    id="pfSavePasswordBtn"
                    disabled={savingPassword}
                  >
                    <span className="pf-btn-text">Update password</span>
                    <span className="pf-spinner"></span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* BOOKING HISTORY */}
          <div className={`pf-panel${activeTab === 'history' ? ' active' : ''}`}>
            <div className="pf-history-summary">
              <div className="pf-summary-card">
                <div className="pf-summary-num">{bookings.length}</div>
                <div className="pf-summary-label">Total bookings</div>
              </div>
              <div className="pf-summary-card">
                <div className="pf-summary-num">{completedBookings.length}</div>
                <div className="pf-summary-label">Completed</div>
              </div>
              <div className="pf-summary-card">
                <div className="pf-summary-num">₱{totalSpent.toLocaleString()}</div>
                <div className="pf-summary-label">Total spent</div>
              </div>
            </div>

            <div className="pf-history">
              {loadingBookings && <p className="pf-history-empty">Loading your bookings…</p>}
              {!loadingBookings && bookingsError && <p className="pf-history-empty">{bookingsError}</p>}
              {!loadingBookings && !bookingsError && bookings.length === 0 && (
                <p className="pf-history-empty">You haven't made any bookings yet.</p>
              )}
              {!loadingBookings && !bookingsError && bookings.map((b) => (
                <div className="pf-booking-row" key={b._id}>
                  <div className="pf-booking-icon">
                    <i className="fa-solid fa-calendar-days"></i>
                  </div>
                  <div className="pf-booking-main">
                    <div className="pf-booking-title">
                      {b.roomLabel}{b.variantLabel ? ` · ${b.variantLabel}` : ''}
                    </div>
                    <div className="pf-booking-sub">{b.date} · {b.timeIn}</div>
                  </div>
                  <div className="pf-booking-right">
                    <div className="pf-booking-price">₱{Number(b.amount || 0).toLocaleString()}</div>
                    <span className={`pf-chip pf-chip--${historyStatusClass(b.status)}`}>{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" className="pf-logout" id="pfLogoutBtn" onClick={handleLogout}>
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