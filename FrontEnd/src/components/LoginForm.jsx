import { useState } from 'react';
import PasswordInput from './PasswordInput';
import Toast from './Toast';
import OtpInput from './OtpInput';
import { useToast } from '../hooks/useToast';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useCountdownClock } from '../hooks/useCountdownClock';
import { useAuth } from '../context/AuthContext';
import { OTP_LENGTH, OTP_EXPIRY_SECONDS, RESEND_COOLDOWN_SECONDS, formatCountdown } from '../utils/otp';

// ─────────────────────────────────────────────────────────────────────────
// LoginForm — extracted from the old standalone Login page so it can be
// swapped with RegisterForm inside the shared Auth card (see
// pages/Login.jsx). Markup, validation, and API calls are unchanged.
// ─────────────────────────────────────────────────────────────────────────

function redirectAfterLogin(user) {
  const isAdmin = ['staff', 'manager', 'super_admin'].includes(user.role);
  // Full navigation (not client-side route) preserved intentionally here —
  // matches the original window.location.href behavior, which also forces
  // a full reload so any app-wide auth state picks up the new session.
  window.location.href = isAdmin ? '/admin/dashboard' : '/';
}

function LoginForm({ onSwitchToRegister, onForgotPassword }) {
  const { login, loginWithGoogle, resendAccountVerification, verifyAccountOtp } = useAuth();
  const { toast, showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Part 8: unverified-account state. Set when /login responds 403 with
  // `unverified: true`; swaps the form for a resend-code / verify-code view
  // reusing the same OtpInput, countdown hook, and utils/otp.js constants
  // as ForgotPasswordModal (no duplicate OTP UI).
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [otpBoxKey, setOtpBoxKey] = useState(0);
  const now = useCountdownClock(codeSent);

  async function handleGoogleCredential(response) {
    try {
      // The original always wrote to localStorage here regardless of the
      // "remember me" checkbox — passing rememberMe=true unconditionally
      // preserves that.
      const user = await loginWithGoogle(response.credential, true);
      showToast('Welcome! Redirecting…', 'success');
      setTimeout(() => redirectAfterLogin(user), 1200);
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

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    const passOk = password.length >= 8;

    setEmailError(emailOk ? '' : 'Enter a valid email address.');
    setPasswordError(passOk ? '' : 'Password must be at least 8 characters.');
    if (!emailOk || !passOk) return;

    setLoading(true);
    try {
      const user = await login(trimmedEmail, password, remember);
      const isAdmin = ['staff', 'manager', 'super_admin'].includes(user.role);
      showToast(
        isAdmin ? 'Welcome, Admin! Redirecting…' : `Welcome back, ${user.firstName}!`,
        'success'
      );
      setTimeout(() => redirectAfterLogin(user), 1200);
    } catch (err) {
      // login() attaches a numeric `.status` for any server-rejected
      // attempt — its absence means the fetch itself never got a response.
      if (typeof err.status === 'number') {
        if (err.unverified) {
          setUnverifiedEmail(trimmedEmail);
          setCodeSent(false);
          setOtp(Array(OTP_LENGTH).fill(''));
          setOtpError('');
          setResendAvailableAt(0);
          setOtpExpiresAt(0);
        } else {
          showToast(err.message, 'error');
        }
      } else {
        showToast('Could not reach the server. Is it running?', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSendVerificationCode() {
    if (!unverifiedEmail || sendingCode) return;
    setSendingCode(true);
    try {
      const { message } = await resendAccountVerification(unverifiedEmail);
      setCodeSent(true);
      setOtp(Array(OTP_LENGTH).fill(''));
      setOtpError('');
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setOtpBoxKey((k) => k + 1);
      showToast(message || 'Verification code sent.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not send the code.', 'error');
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyOtpSubmit(e) {
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

    setVerifyingOtp(true);
    try {
      await verifyAccountOtp(unverifiedEmail, code);
      showToast('Email verified! You can now sign in.', 'success');
      setUnverifiedEmail('');
      setCodeSent(false);
    } catch (err) {
      setOtpError(err.message || 'Incorrect verification code.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  function handleCancelVerification() {
    setUnverifiedEmail('');
    setCodeSent(false);
  }

  if (unverifiedEmail) {
    const secondsUntilResend = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;
    const secondsUntilExpiry = otpExpiresAt ? Math.max(0, Math.ceil((otpExpiresAt - now) / 1000)) : 0;
    const otpExpired = otpExpiresAt > 0 && secondsUntilExpiry === 0;

    return (
      <>
        <div className="login-card-header">
          <h2>Verify your email</h2>
          <p>Please verify your email before signing in.</p>
        </div>

        {!codeSent ? (
          <div className="forgot-modal-actions">
            <button type="button" className="btn-cancel" onClick={handleCancelVerification}>
              Back to log in
            </button>
            <button
              type="button"
              className={`btn-submit${sendingCode ? ' loading' : ''}`}
              onClick={handleSendVerificationCode}
            >
              <span className="btn-text">Resend Verification Code</span>
              <span className="btn-spinner">
                <span className="spinner-ring"></span>
              </span>
            </button>
          </div>
        ) : (
          <>
            <form className="login-form" onSubmit={handleVerifyOtpSubmit} noValidate>
              <div className={`field${otpError ? ' has-error' : ''}`}>
                <label htmlFor="login-otp-0">Verification code</label>
                <OtpInput
                  key={otpBoxKey}
                  value={otp}
                  onChange={(next) => {
                    setOtp(next);
                    setOtpError('');
                  }}
                  idPrefix="login-otp"
                />
                <span className="field-error" style={{ display: otpError ? 'block' : 'none' }}>
                  {otpError}
                </span>
                <span className="otp-expiry">
                  {otpExpired ? 'Code expired.' : `Code expires in ${formatCountdown(secondsUntilExpiry)}`}
                </span>
              </div>

              <div className="forgot-modal-actions">
                <button type="button" className="btn-cancel" onClick={handleCancelVerification}>
                  Cancel
                </button>
                <button type="submit" className={`btn-submit${verifyingOtp ? ' loading' : ''}`}>
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
                onClick={handleSendVerificationCode}
                disabled={secondsUntilResend > 0}
              >
                {secondsUntilResend > 0 ? `Resend code (${secondsUntilResend}s)` : 'Resend code'}
              </button>
            </div>
          </>
        )}

        <Toast {...toast} />
      </>
    );
  }

  return (
    <>
      <form className="login-form" onSubmit={handleSubmit} noValidate>

        {/* Email */}
        <div className={`field${emailError ? ' has-error' : ''}`} id="field-email">
          <label htmlFor="email">Email address</label>
          <div className="input-wrap">
            <input
              type="email"
              id="email"
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

        {/* Password */}
        <div className={`field${passwordError ? ' has-error' : ''}`} id="field-password">
          <div className="password-row">
            <label htmlFor="password">Password</label>
            <button type="button" className="forgot-link" onClick={onForgotPassword}>
              Forgot password?
            </button>
          </div>
          <PasswordInput
            id="password"
            name="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError('');
            }}
            error={passwordError}
          />
        </div>

        {/* Remember */}
        <div className="remember-row">
          <input
            type="checkbox"
            id="remember-input"
            checked={remember}
            onChange={() => {}}
            style={{ display: 'none' }}
          />
          <div
            className={`custom-check${remember ? ' checked' : ''}`}
            role="checkbox"
            aria-checked={remember}
            tabIndex={0}
            onClick={() => setRemember((r) => !r)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setRemember((r) => !r);
              }
            }}
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path
                d="M1 4L3.5 6.5L9 1"
                stroke="#0A1628"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <label htmlFor="remember-input" className="remember-label">
            Remember me for 30 days
          </label>
        </div>

        {/* Submit */}
        <button type="submit" className={`btn-submit${loading ? ' loading' : ''}`}>
          <span className="btn-text">Continue</span>
          <span className="btn-spinner">
            <span className="spinner-ring"></span>
          </span>
        </button>

        <div className="divider">or</div>

        {/* Google */}
        <button type="button" className="btn-social" onClick={handleGoogleClick}>
          {/* KEEP YOUR EXISTING GOOGLE SVG HERE */}
          Continue with Google
        </button>

        <div className="signup-row">
          New here?{' '}
          <button type="button" className="link-button" onClick={onSwitchToRegister}>
            Create a free account
          </button>
        </div>

      </form>

      <Toast {...toast} />
    </>
  );
}

export default LoginForm;