import { useState, useEffect, useRef } from 'react';
import { X, Mail, ArrowRight } from 'lucide-react';
import Toast from './Toast';
import OtpInput from './OtpInput';
import PasswordInput from './PasswordInput';
import PasswordRequirementsList from './PasswordRequirementsList';
import { useToast } from '../hooks/useToast';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useCountdownClock } from '../hooks/useCountdownClock';
import { useAuth } from '../context/AuthContext';
import { OTP_LENGTH, OTP_EXPIRY_SECONDS, RESEND_COOLDOWN_SECONDS, formatCountdown } from '../utils/otp';
import { isPasswordStrongEnough } from '../utils/password';

function ClaimAccountModal({ open, onClose }) {
  const { claimGuestByEmailStart, claimGuestByEmailResendOtp, claimGuestByEmailVerifyOtp, claimGuestByGoogle } = useAuth();
  const { toast, showToast } = useToast();
  const emailInputRef = useRef(null);
  const modalRef = useRef(null);

  const [tab, setTab] = useState('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [otpBoxKey, setOtpBoxKey] = useState(0);
  const now = useCountdownClock(sent);

  const passwordValid = isPasswordStrongEnough(password);

  useEffect(() => {
    if (!open) return;
    setTab('email');
    setEmail('');
    setPassword('');
    setEmailError('');
    setPasswordError('');
    setSent(false);
    setOtp(Array(OTP_LENGTH).fill(''));
    setOtpError('');
    setResendAvailableAt(0);
    setOtpExpiresAt(0);
    setOtpBoxKey((k) => k + 1);
    const raf = requestAnimationFrame(() => emailInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

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

  async function handleGoogleCredential(response) {
    if (!response.code) {
      if (response.error && response.error !== 'access_denied') {
        showToast('Google sign-in failed.', 'error');
      }
      return;
    }
    try {
      await claimGuestByGoogle(response.code);
      showToast('Your account has been saved!', 'success');
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
      showToast(err.message || 'Google sign-in failed.', 'error');
    }
  }

  const { triggerSignIn } = useGoogleAuth(handleGoogleCredential);

  function handleGoogleClick() {
    const ok = triggerSignIn();
    if (!ok) {
      showToast('Google sign-in is still loading — try again in a second.', 'error');
    }
  }

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmed = email.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    setEmailError(emailOk ? '' : 'Enter a valid email address.');
    setPasswordError(passwordValid ? '' : 'Password does not meet all requirements.');
    if (!emailOk || !passwordValid) return;

    setSending(true);
    try {
      await claimGuestByEmailStart(trimmed, password);
      setSent(true);
      setOtp(Array(OTP_LENGTH).fill(''));
      setOtpError('');
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setOtpBoxKey((k) => k + 1);
    } catch (err) {
      if (err.field === 'email') {
        setEmailError(err.message);
      } else if (err.field === 'password') {
        setPasswordError(err.message);
      } else {
        showToast(err.message || 'Could not send a verification code.', 'error');
      }
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    if (now < resendAvailableAt) return;
    try {
      await claimGuestByEmailResendOtp();
      setOtp(Array(OTP_LENGTH).fill(''));
      setOtpError('');
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setOtpBoxKey((k) => k + 1);
      showToast('A new code has been sent.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not resend the code.', 'error');
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
      await claimGuestByEmailVerifyOtp(code);
      showToast('Your account has been saved!', 'success');
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
      setOtpError(err.message || 'Incorrect verification code.');
    } finally {
      setVerifying(false);
    }
  }

  const secondsUntilExpiry = otpExpiresAt ? Math.max(0, Math.ceil((otpExpiresAt - now) / 1000)) : 0;
  const secondsUntilResend = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;
  const otpExpired = otpExpiresAt > 0 && secondsUntilExpiry === 0;

  return (
    <div className="claim-modal-scope">
      <div className="forgot-modal-backdrop">
        <div
          className="forgot-modal login-card"
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="claim-modal-title"
        >
          <button type="button" className="forgot-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>

        {!sent ? (
          <>
            <div className="login-card-header">
              <h2 id="claim-modal-title">Save your account</h2>
              <p>Turn this guest session into a permanent account.</p>
            </div>

            <div className="profile-tabs">
              <button
                type="button"
                className={`profile-tab${tab === 'email' ? ' active' : ''}`}
                onClick={() => setTab('email')}
              >
                Email & Password
              </button>
              <button
                type="button"
                className={`profile-tab${tab === 'google' ? ' active' : ''}`}
                onClick={() => setTab('google')}
              >
                Google
              </button>
            </div>

            {tab === 'email' ? (
              <form className="login-form" onSubmit={handleSubmit} noValidate>
                <div className={`field${emailError ? ' has-error' : ''}`}>
                  <label htmlFor="claim-email">Email address</label>
                  <div className="input-wrap">
                    <input
                      ref={emailInputRef}
                      type="email"
                      id="claim-email"
                      name="email"
                      placeholder="you@email.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError('');
                      }}
                    />
                    <Mail size={18} className="input-icon" />
                  </div>
                  <span className="field-error" style={{ display: emailError ? 'block' : 'none' }}>
                    {emailError || 'Enter a valid email address.'}
                  </span>
                </div>

                <div className={`field${passwordError ? ' has-error' : ''}`}>
                  <label htmlFor="claim-password">Password</label>
                  <PasswordInput
                    id="claim-password"
                    name="password"
                    placeholder="Create a password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    error={passwordError}
                  >
                    <PasswordRequirementsList password={password} />
                  </PasswordInput>
                </div>

                <div className="forgot-modal-actions">
                  <button type="button" className="btn-cancel" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className={`btn-submit${sending ? ' loading' : ''}`}>
                    <span className="btn-text">Send verification code</span>
                    <span className="btn-spinner">
                      <span className="spinner-ring"></span>
                    </span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="forgot-modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button type="button" className="btn-social" onClick={handleGoogleClick}>
                  <span className="btn-social-label">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                        fill="#4285F4"
                      />
                      <path
                        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                        fill="#34A853"
                      />
                      <path
                        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                        fill="#EA4335"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </span>
                  <ArrowRight size={16} className="btn-social-arrow" />
                </button>
                <button type="button" className="btn-cancel" onClick={onClose} style={{ marginTop: '.75rem' }}>
                  Cancel
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="login-card-header">
              <h2 id="claim-modal-title">Enter verification code</h2>
              <p>We've sent a code to <strong>{email.trim()}</strong></p>
            </div>

            <form className="login-form" onSubmit={handleVerifySubmit} noValidate>
              <div className={`field${otpError ? ' has-error' : ''}`}>
                <label htmlFor="claim-otp-0">Verification code</label>
                <OtpInput
                  key={otpBoxKey}
                  value={otp}
                  onChange={(next) => {
                    setOtp(next);
                    setOtpError('');
                  }}
                  idPrefix="claim-otp"
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
              <button type="button" className="link-button" onClick={() => setSent(false)}>
                Back
              </button>
            </div>
          </>
        )}
      </div>

        <Toast {...toast} />
      </div>
    </div>
  );
}

export default ClaimAccountModal;