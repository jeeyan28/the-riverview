import { useState, useEffect, useRef } from 'react';
import Toast from './Toast';
import OtpInput from './OtpInput';
import { useToast } from '../hooks/useToast';
import { useCountdownClock } from '../hooks/useCountdownClock';
import PasswordInput from './PasswordInput';
import PasswordRequirementsList from './PasswordRequirementsList';
import { OTP_LENGTH, OTP_EXPIRY_SECONDS, RESEND_COOLDOWN_SECONDS, formatCountdown } from '../utils/otp';
import { isPasswordStrongEnough } from '../utils/password';
import { API_BASE_URL } from '../services/api';

const DEFAULT_SENT_COPY =
  `If an account exists for that email, a verification code has been sent. It'll expire in ${Math.round(OTP_EXPIRY_SECONDS / 60)} minutes.`;

async function requestReset(email) {
  const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  return data.message || DEFAULT_SENT_COPY;
}

async function verifyOtp(email, otp) {
  const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, message: data.message, resetSessionToken: data.resetSessionToken };
}

async function submitNewPassword(resetSessionToken, password) {
  const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetSessionToken, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, message: data.message };
}

function ForgotPasswordModal({ open, onClose, onReturnToLogin }) {
  const { toast, showToast } = useToast();
  const emailInputRef = useRef(null);
  const modalRef = useRef(null);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCopy, setSentCopy] = useState(DEFAULT_SENT_COPY);
  const [sentEmail, setSentEmail] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resetSessionToken, setResetSessionToken] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  // Remounts <OtpInput> (via its `key`) so its auto-focus-first-box effect
  // fires again after a resend, without exposing an imperative focus API.
  const [otpBoxKey, setOtpBoxKey] = useState(0);
  const now = useCountdownClock(sent);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Reset to a clean request view each time the modal opens, and auto-focus
  // the email input.
  useEffect(() => {
    if (!open) return;
    setEmail('');
    setEmailError('');
    setSent(false);
    setSentCopy(DEFAULT_SENT_COPY);
    setSentEmail('');
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setVerified(false);
    setResetSessionToken('');
    setResendAvailableAt(0);
    setOtpExpiresAt(0);
    setOtpBoxKey((k) => k + 1);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setConfirmError('');
    setResetDone(false);
    const raf = requestAnimationFrame(() => emailInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Escape closes; Tab is trapped inside the modal while it's open.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmed = email.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    setEmailError(emailOk ? '' : 'Enter a valid email address.');
    if (!emailOk) return;

    setLoading(true);
    try {
      const message = await requestReset(trimmed);
      setSentCopy(message);
      setSentEmail(trimmed);
      setSent(true);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
    } catch (err) {
      showToast('Could not reach the server. Is it running?', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!sentEmail || now < resendAvailableAt) return;
    try {
      const message = await requestReset(sentEmail);
      setOtp(Array(OTP_LENGTH).fill(''));
      setOtpError('');
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setOtpBoxKey((k) => k + 1); // remounts OtpInput so it auto-focuses box 0 again
      showToast(message, 'success');
    } catch (err) {
      showToast('Could not reach the server. Is it running?', 'error');
    }
  }

  async function handleVerifySubmit(e) {
    e.preventDefault();

    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setOtpError('Enter all 6 digits.');
      return;
    }
    if (otpExpiresAt && now >= otpExpiresAt) {
      setOtpError('That code has expired. Request a new one.');
      return;
    }

    setVerifying(true);
    try {
      const { ok, message, resetSessionToken } = await verifyOtp(sentEmail, code);
      if (!ok) {
        setOtpError(message || 'Incorrect verification code.');
        return;
      }
      setVerified(true);
      setResetSessionToken(resetSessionToken);
    } catch (err) {
      showToast('Could not reach the server. Is it running?', 'error');
    } finally {
      setVerifying(false);
    }
  }

  const secondsUntilExpiry = otpExpiresAt ? Math.max(0, Math.ceil((otpExpiresAt - now) / 1000)) : 0;
  const secondsUntilResend = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;
  const otpExpired = otpExpiresAt > 0 && secondsUntilExpiry === 0;

  const passwordValid = isPasswordStrongEnough(newPassword);
  const confirmMatches = confirmPassword.length > 0 && confirmPassword === newPassword;
  const canSubmitPassword = passwordValid && confirmMatches && !resetting;

  async function handlePasswordSubmit(e) {
    e.preventDefault();

    if (!passwordValid) {
      setPasswordError('Password does not meet all requirements.');
      return;
    }
    if (!confirmMatches) {
      setConfirmError('Passwords do not match.');
      return;
    }

    setPasswordError('');
    setConfirmError('');
    setResetting(true);
    try {
      const { ok, message } = await submitNewPassword(resetSessionToken, newPassword);
      if (!ok) {
        setPasswordError(message || 'Could not reset password.');
        return;
      }
      setResetDone(true);
    } catch (err) {
      showToast('Could not reach the server. Is it running?', 'error');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div
      className="forgot-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="forgot-modal login-card"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-modal-title"
      >
        <button type="button" className="forgot-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {!sent ? (
          <>
            <div className="login-card-header">
              <h2 id="forgot-modal-title">Reset your password</h2>
              <p>Enter your email address and we'll send a verification code.</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className={`field${emailError ? ' has-error' : ''}`}>
                <label htmlFor="forgot-email">Email address</label>
                <div className="input-wrap">
                  <input
                    ref={emailInputRef}
                    type="email"
                    id="forgot-email"
                    name="email"
                    placeholder="you@email.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError('');
                    }}
                  />
                  <span className="input-icon">✉</span>
                </div>
                <span className="field-error" style={{ display: emailError ? 'block' : 'none' }}>
                  {emailError || 'Enter a valid email address.'}
                </span>
              </div>

              <div className="forgot-modal-actions">
                <button type="button" className="btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className={`btn-submit${loading ? ' loading' : ''}`}>
                  <span className="btn-text">Send verification code</span>
                  <span className="btn-spinner">
                    <span className="spinner-ring"></span>
                  </span>
                </button>
              </div>
            </form>
          </>
        ) : verified && resetDone ? (
          <>
            <div className="login-card-header forgot-success">
              <span className="forgot-success-icon" aria-hidden="true">✓</span>
              <h2 id="forgot-modal-title">Password updated</h2>
              <p>Your password has been changed. You can now log in.</p>
            </div>

            <div className="forgot-modal-actions">
              <button
                type="button"
                className="btn-submit"
                onClick={() => (onReturnToLogin ? onReturnToLogin() : onClose?.())}
              >
                <span className="btn-text">Return to Login</span>
              </button>
            </div>
          </>
        ) : verified ? (
          <>
            <div className="login-card-header">
              <h2 id="forgot-modal-title">Create a new password</h2>
              <p>Choose a strong password for your account.</p>
            </div>

            <form className="login-form" onSubmit={handlePasswordSubmit} noValidate>
              <div className={`field${passwordError ? ' has-error' : ''}`}>
                <label htmlFor="new-password">New password</label>
                <PasswordInput
                  id="new-password"
                  name="newPassword"
                  placeholder="Enter a new password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordError('');
                  }}
                  error={passwordError}
                />

                <PasswordRequirementsList password={newPassword} />
              </div>

              <div className={`field${confirmError ? ' has-error' : ''}`}>
                <label htmlFor="confirm-password">Confirm password</label>
                <PasswordInput
                  id="confirm-password"
                  name="confirmPassword"
                  placeholder="Re-enter the new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setConfirmError('');
                  }}
                  error={confirmError}
                />
              </div>

              <div className="forgot-modal-actions">
                <button type="button" className="btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn-submit${resetting ? ' loading' : ''}`}
                  disabled={!canSubmitPassword}
                >
                  <span className="btn-text">Update password</span>
                  <span className="btn-spinner">
                    <span className="spinner-ring"></span>
                  </span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="login-card-header">
              <h2 id="forgot-modal-title">Enter verification code</h2>
              <p>{sentCopy}</p>
            </div>

            <form className="login-form" onSubmit={handleVerifySubmit} noValidate>
              <div className={`field${otpError ? ' has-error' : ''}`}>
                <label htmlFor="otp-0">Verification code</label>
                <OtpInput
                  key={otpBoxKey}
                  value={otp}
                  onChange={(next) => {
                    setOtp(next);
                    setOtpError('');
                  }}
                  idPrefix="otp"
                />
                <span className="field-error" style={{ display: otpError ? 'block' : 'none' }}>
                  {otpError}
                </span>
                <span className="otp-expiry">
                  {otpExpired ? 'Code expired.' : `Code expires in ${formatCountdown(secondsUntilExpiry)}`}
                </span>
              </div>

              <div className="forgot-modal-actions">
                <button type="button" className="btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className={`btn-submit${verifying ? ' loading' : ''}`}>
                  <span className="btn-text">Verify code</span>
                  <span className="btn-spinner">
                    <span className="spinner-ring"></span>
                  </span>
                </button>
              </div>
            </form>

            <div className="signup-row">
              <button
                type="button"
                className="link-button"
                onClick={handleResend}
                disabled={secondsUntilResend > 0}
              >
                {secondsUntilResend > 0 ? `Resend code (${secondsUntilResend}s)` : 'Resend code'}
              </button>
              {' · '}
              <button type="button" className="link-button" onClick={onClose}>
                Back to log in
              </button>
            </div>
          </>
        )}
      </div>

      <Toast {...toast} />
    </div>
  );
}

export default ForgotPasswordModal;