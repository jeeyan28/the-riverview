import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { bookingsService } from '../services/bookings';
import { API_BASE_URL } from '../services/api';
import { openBookingReceipt } from '../utils/receipt';
import PasswordInput from './PasswordInput';
import { PASSWORD_REQUIREMENTS } from '../utils/password';
import RescheduleModal, { canRescheduleBooking } from './RescheduleModal';
import LogoutConfirmDialog from './LogoutConfirmDialog';
import { AlertTriangle, CalendarDays, CheckCircle2, Download, X } from 'lucide-react';
import ModalPortal from './ModalPortal';

const EMPTY_DETAILS = { firstName: '', lastName: '', phone: '', email: '' };
const EMPTY_PASSWORD = { currentPassword: '', newPassword: '', confirmPassword: '' };

function historyStatusClass(status) {
  if (['Confirmed', 'Ongoing', 'Done'].includes(status)) return 'completed';
  if (['Rejected', 'Cancelled', 'Overdue', 'No Show'].includes(status)) return 'cancelled';
  return 'upcoming';
}

function paymentBreakdown(booking) {
  const total = Math.max(0, Number(booking?.amount) || 0);
  const received = Math.max(0, Number(booking?.paidAmount) || 0, Number(booking?.downPayment) || 0);
  const refunded = Math.min(received, Math.max(0, Number(booking?.refundedAmount) || 0));
  const paid = Math.max(0, received - refunded);
  const balance = Math.max(0, total - paid);
  const status = total > 0 && balance <= 0 ? 'Paid' : paid > 0 ? 'Downpayment paid' : 'Payment due';
  return { total, paid, balance, status };
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
  const [viewingBooking, setViewingBooking] = useState(null);
  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [cancellingBooking, setCancellingBooking] = useState(null);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const toastTimer = useRef(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
      email: u.isGuest ? '' : (u.email || ''),
    });
  }

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
      setViewingBooking(null);
      setCancellingBooking(null);
      setLoadingBookings(true);
      try {
        const data = await bookingsService.mine();
        if (!cancelled) setBookings(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setBookingsError(err.message || 'Could not load your reservations.');
      } finally {
        if (!cancelled) setLoadingBookings(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function handleClose() {
    onClose?.();
  }

  async function handleLogout() {
    setShowLogoutConfirm(true);
  }

  async function confirmLogout() {
    setShowLogoutConfirm(false);
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

      const updated = { ...user, ...data };
      setUser(updated);
      pfRenderUser(updated);
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
  const totalSpent = completedBookings.reduce((sum, booking) => sum + paymentBreakdown(booking).paid, 0);

  return (
    <ModalPortal>
      <div
        className={`pf-overlay${open ? ' open' : ''}`}
        id="profileModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <div className="pf-modal">
          <div className="pf-modal-head">
            <div><h2 className="pf-modal-title" id="profile-modal-title">Your Riverview account</h2><p className="pf-modal-subtitle">Manage your details and every reservation in one place.</p></div>
            <button className="pf-close" id="pfClose" aria-label="Close" onClick={handleClose}>
              <X size={19} aria-hidden="true" />
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
              Reservations <span className="pf-tab-count">{bookings.length}</span>
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
                <div className="pf-identity"><strong>{`${details.firstName} ${details.lastName}`.trim() || 'Riverview guest'}</strong><span>{details.email || 'Guest account'}</span></div>
              </div>

              <form id="pfDetailsForm" noValidate className="pf-fields" onSubmit={handleDetailsSubmit}>
                <div className="pf-field">
                  <label htmlFor="pfFirstName">First name</label>
                  <input
                    type="text"
                    id="pfFirstName"
                    placeholder="First name"
                    value={details.firstName}
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
                    onChange={(e) => setDetails((d) => ({ ...d, lastName: e.target.value }))}
                  />
                </div>
                <div className="pf-field">
                  <label htmlFor="pfEmailReadonly">Email</label>
                  <input
                    type="email"
                    id="pfEmailReadonly"
                    value={details.email}
                    placeholder={authUser?.isGuest ? 'Not set — claim your account to add one' : ''}
                    disabled
                    readOnly
                  />
                </div>
                <div className="pf-field">
                  <label htmlFor="pfPhone">Phone number</label>
                  <div className="pf-phone-field">
                    <span className="pf-flag-pick">🇵🇭 +63</span>
                    <input
                      type="tel"
                      id="pfPhone"
                      placeholder="9XX XXX XXXX"
                      value={details.phone}
                      onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
                    />
                  </div>
                </div>

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
              </form>
            </div>

            {!isGoogleAccount && (
              <details className="pf-disclosure">
                <summary>
                  <span><strong>Change password</strong><small>Open only when you need to update your sign-in.</small></span>
                  <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
                </summary>
                <form id="pfPasswordForm" noValidate onSubmit={handlePasswordSubmit} className="pf-disclosure-body">
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
              </details>
            )}
          </div>

          <div className={`pf-panel${activeTab === 'history' ? ' active' : ''}`}>
            <div className="pf-history-summary">
              <div className="pf-summary-card">
                <div className="pf-summary-num">{bookings.length}</div>
                <div className="pf-summary-label">Total reservations</div>
              </div>
              <div className="pf-summary-card">
                <div className="pf-summary-num">{completedBookings.length}</div>
                <div className="pf-summary-label">Completed</div>
              </div>
              <div className="pf-summary-card">
                <div className="pf-summary-num">₱{totalSpent.toLocaleString()}</div>
                <div className="pf-summary-label">Recorded payments</div>
              </div>
            </div>

            <div className="pf-history">
              {loadingBookings && <p className="pf-history-empty">Loading your reservations…</p>}
              {!loadingBookings && bookingsError && <p className="pf-history-empty">{bookingsError}</p>}
              {!loadingBookings && !bookingsError && bookings.length === 0 && (
                <p className="pf-history-empty">You haven't made any reservations yet.</p>
              )}
              {!loadingBookings && !bookingsError && bookings.map((b) => {
                const payment = paymentBreakdown(b);
                return (
                <article className="pf-booking-row" key={b._id}>
                  <div className="pf-booking-icon">
                    <CalendarDays size={18} aria-hidden="true" />
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
                    <span className={`pf-payment-state pf-payment-state--${payment.status === 'Paid' ? 'paid' : payment.paid > 0 ? 'partial' : 'unpaid'}`}>{payment.status}{payment.balance > 0 ? ` · ₱${payment.balance.toLocaleString()} due` : ''}</span>
                  </div>
                  <button
                    type="button"
                    className="pf-view-btn"
                    onClick={() => setViewingBooking(b)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="pf-view-btn"
                    onClick={() => openBookingReceipt(b)}
                  >
                    <Download size={14} aria-hidden="true" /> Receipt
                  </button>
                </article>
              );})}
            </div>
          </div>

          <button type="button" className="pf-logout" id="pfLogoutBtn" onClick={handleLogout}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i>Log out
          </button>
        </div>
      </div>

      {viewingBooking && (
        <div className="pf-overlay open">
          <div className="pf-modal">
            <div className="pf-modal-head">
              <div><h2 className="pf-modal-title">Reservation details</h2><p className="pf-modal-subtitle">{viewingBooking.reservationCode || 'Reservation record'}</p></div>
              <button className="pf-close" aria-label="Close" onClick={() => setViewingBooking(null)}>
                <X size={19} aria-hidden="true" />
              </button>
            </div>

            {(() => {
              const payment = paymentBreakdown(viewingBooking);
              return (
                <section className="pf-payment-breakdown" aria-label="Payment summary">
                  <div><span>Total charge</span><strong>₱{payment.total.toLocaleString()}</strong></div>
                  <div><span>Paid so far</span><strong>₱{payment.paid.toLocaleString()}</strong></div>
                  <div className={payment.balance > 0 ? 'has-balance' : 'is-settled'}><span>{payment.balance > 0 ? 'Pay at venue' : 'Balance'}</span><strong>₱{payment.balance.toLocaleString()}</strong></div>
                  <p>{payment.balance > 0 ? 'Your online downpayment secured the slot. Please settle the remaining balance at the venue.' : 'This reservation is fully paid.'}</p>
                </section>
              );
            })()}

            <div className="pf-detail-list">
              <div className="pf-detail-row">
                <span className="pf-detail-label">Reservation code</span>
                <span className="pf-detail-value">{viewingBooking.reservationCode || '—'}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Reserved by</span>
                <span className="pf-detail-value">{viewingBooking.guestName || '—'}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Contact no.</span>
                <span className="pf-detail-value">{viewingBooking.guestContact || '—'}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Email</span>
                <span className="pf-detail-value">{viewingBooking.guestEmail || '—'}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Room</span>
                <span className="pf-detail-value">
                  {viewingBooking.roomLabel}{viewingBooking.variantLabel ? ` · ${viewingBooking.variantLabel}` : ''}
                </span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Facility</span>
                <span className="pf-detail-value">{viewingBooking.room?.name || viewingBooking.roomLabel || '—'}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Reservation date</span>
                <span className="pf-detail-value">{viewingBooking.date}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Time</span>
                <span className="pf-detail-value">{viewingBooking.timeIn} · {viewingBooking.duration}h</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Guests</span>
                <span className="pf-detail-value">{viewingBooking.guestCount || 1}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Reserved on</span>
                <span className="pf-detail-value">
                  {viewingBooking.createdAt
                    ? new Date(viewingBooking.createdAt).toLocaleString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—'}
                </span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Amount</span>
                <span className="pf-detail-value">₱{Number(viewingBooking.amount || 0).toLocaleString()}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Payment method</span>
                <span className="pf-detail-value">{viewingBooking.paymentMethod || '—'}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Payment status</span>
                <span className="pf-detail-value">{viewingBooking.paymentStatus || '—'}</span>
              </div>
              <div className="pf-detail-row">
                <span className="pf-detail-label">Status</span>
                <span className={`pf-chip pf-chip--${historyStatusClass(viewingBooking.status)}`}>{viewingBooking.status}</span>
              </div>
              {viewingBooking.specialRequests && (
                <div className="pf-detail-row pf-detail-row--block">
                  <span className="pf-detail-label">Special requests</span>
                  <span className="pf-detail-value">{viewingBooking.specialRequests}</span>
                </div>
              )}
            </div>

            <div className="pf-modal-actions">
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setViewingBooking(null)}>
                Close
              </button>
              {canRescheduleBooking(viewingBooking) && (
                <button
                  type="button"
                  className="pf-btn pf-btn-ghost"
                  onClick={() => setReschedulingBooking(viewingBooking)}
                >
                  <i className="fa-solid fa-calendar-clock"></i> Reschedule
                </button>
              )}
              {viewingBooking.status === 'Confirmed' && viewingBooking.cancellationStatus !== 'Requested' && viewingBooking.cancellationStatus !== 'Approved' && (
                <button type="button" className="pf-btn pf-btn-ghost pf-btn-danger" onClick={() => setCancellingBooking(viewingBooking)}>
                  <i className="fa-solid fa-ban"></i> Request cancellation
                </button>
              )}
              <button type="button" className="pf-btn pf-btn-solid" onClick={() => openBookingReceipt(viewingBooking)}>
                <Download size={15} aria-hidden="true" /> Download receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {reschedulingBooking && (
        <RescheduleModal
          booking={reschedulingBooking}
          onClose={() => setReschedulingBooking(null)}
          onRescheduled={(updated) => {
            setBookings((prev) => prev.map((b) => (b._id === updated._id ? { ...b, ...updated } : b)));
            setViewingBooking((v) => (v && v._id === updated._id ? { ...v, ...updated } : v));
            setReschedulingBooking(null);
          }}
        />
      )}

      {cancellingBooking && (
        <CancellationRequestModal
          booking={cancellingBooking}
          onClose={() => setCancellingBooking(null)}
          onSubmitted={(updated) => {
            setBookings((prev) => prev.map((b) => (b._id === updated._id ? { ...b, ...updated } : b)));
            setViewingBooking((v) => (v && v._id === updated._id ? { ...v, ...updated } : v));
            setCancellingBooking(null);
            pfShowToast('Cancellation request sent for review.');
          }}
          onError={(message) => pfShowToast(message, 'error')}
        />
      )}

      <div className={`pf-toast${toast.visible ? ' show' : ''}${toast.type === 'error' ? ' error' : ''}`} id="pfToast">
        <span id="pfToastIcon">{toast.type === 'error' ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}</span>
        <span id="pfToastMsg">{toast.message}</span>
      </div>

      <LogoutConfirmDialog
        open={showLogoutConfirm}
        isGuest={!!authUser?.isGuest}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </ModalPortal>
  );
}

function CancellationRequestModal({ booking, onClose, onSubmitted, onError }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const value = reason.trim();
    if (!value) return;
    setSubmitting(true);
    try {
      const updated = await bookingsService.requestCancellation(booking._id, { reason: value });
      onSubmitted(updated);
    } catch (err) {
      onError(err.message || 'Could not request cancellation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pf-overlay open" role="dialog" aria-modal="true" aria-label="Request reservation cancellation">
      <div className="pf-modal pf-modal--compact">
        <div className="pf-modal-head"><h2 className="pf-modal-title">Request cancellation</h2><button className="pf-close" aria-label="Close" onClick={onClose}><i className="fa-solid fa-xmark"></i></button></div>
        <p className="pf-detail-value">Your request for {booking.reservationCode || 'this reservation'} will be reviewed by the team. Any refund is handled manually after approval.</p>
        <form onSubmit={submit}>
          <div className="pf-field"><label htmlFor="cancel-reason">Reason</label><textarea id="cancel-reason" rows="4" maxLength="500" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell us why you need to cancel" /></div>
          <div className="pf-modal-actions"><button type="button" className="pf-btn pf-btn-ghost" onClick={onClose}>Keep reservation</button><button type="submit" className="pf-btn pf-btn-solid" disabled={submitting || !reason.trim()}>{submitting ? 'Sending…' : 'Send request'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default ProfileModal;
