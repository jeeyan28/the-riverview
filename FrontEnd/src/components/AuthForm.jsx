import { useState } from 'react';
import { Mail, User, ArrowRight, Shield, Lock, ShieldCheck } from 'lucide-react';
import PasswordInput from './PasswordInput';
import PasswordRequirementsList from './PasswordRequirementsList';
import Toast from './Toast';
import OtpInput from './OtpInput';
import { useToast } from '../hooks/useToast';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useCountdownClock } from '../hooks/useCountdownClock';
import { useAuth } from '../context/AuthContext';
import { OTP_LENGTH, OTP_EXPIRY_SECONDS, RESEND_COOLDOWN_SECONDS, formatCountdown } from '../utils/otp';
import { isPasswordStrongEnough } from '../utils/password';
import { validateName, normalizeName } from '../utils/name';

function redirectAfterLogin(user) {
  const isAdmin = ['staff', 'manager', 'super_admin'].includes(user.role);
  window.location.href = isAdmin ? '/admin/dashboard' : '/';
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return email || '';
  return `${local[0]}***@${domain}`;
}

function AuthForm({ mode, onSwitchMode, onForgotPassword }) {
  const isLogin = mode === 'login';
  const {
    login,
    register,
    loginWithGoogle,
    resendAccountVerification,
    verifyAccountOtp,
    verifyRegistrationOtp,
    resendRegistrationOtp,
  } = useAuth();
  const { toast, showToast } = useToast();

  async function handleGoogleCredential(response) {
    if (!response.code) {
      if (response.error && response.error !== 'access_denied') {
        showToast('Google sign-in failed.', 'error');
      }
      return;
    }
    try {
      const user = await loginWithGoogle(response.code, true);
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

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

  async function handleLoginSubmit(e) {
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

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  const [stage, setStage] = useState('form');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [regOtp, setRegOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [regOtpError, setRegOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [regOtpExpiresAt, setRegOtpExpiresAt] = useState(0);
  const [regResendAvailableAt, setRegResendAvailableAt] = useState(0);
  const [regOtpBoxKey, setRegOtpBoxKey] = useState(0);
  const regNow = useCountdownClock(stage === 'otp');

  const regSecondsUntilExpiry = regOtpExpiresAt ? Math.max(0, Math.ceil((regOtpExpiresAt - regNow) / 1000)) : 0;
  const regSecondsUntilResend = regResendAvailableAt ? Math.max(0, Math.ceil((regResendAvailableAt - regNow) / 1000)) : 0;
  const regOtpExpired = regOtpExpiresAt > 0 && regSecondsUntilExpiry === 0;

  const [errors, setErrors] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirm: '',
    terms: '',
  });

  function clearError(field) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
  }

  const passwordValid = isPasswordStrongEnough(regPassword);

  async function handleRegisterSubmit(e) {
    e.preventDefault();

    const trimmedEmail = regEmail.trim();

    const firstNameError = validateName(firstName, 'First name');
    const lastNameError = validateName(lastName, 'Last name');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    const passOk = passwordValid;
    const confirmOk = regPassword === confirm;

    setErrors({
      firstName: firstNameError,
      lastName: lastNameError,
      email: emailOk ? '' : 'Enter a valid email address.',
      password: passOk ? '' : 'Password does not meet all requirements.',
      confirm: confirmOk ? '' : 'Passwords do not match.',
      terms: terms ? '' : 'You must accept the terms to continue.',
    });

    if (firstNameError || lastNameError || !emailOk || !passOk || !confirmOk || !terms) {
      return;
    }

    setRegLoading(true);
    try {
      const data = await register({
        firstName: normalizeName(firstName),
        lastName: normalizeName(lastName),
        email: trimmedEmail,
        password: regPassword,
      });
      setVerificationEmail(data.email || trimmedEmail);
      setRegOtp(Array(OTP_LENGTH).fill(''));
      setRegOtpError('');
      setRegOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setRegResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setRegOtpBoxKey((k) => k + 1);
      setStage('otp');
    } catch (err) {
      if (err.status === 409) {
        setErrors((prev) => ({
          ...prev,
          email: err.message || 'An account with this email already exists.',
        }));
      } else if (err.field && Object.prototype.hasOwnProperty.call(errors, err.field)) {
        setErrors((prev) => ({ ...prev, [err.field]: err.message }));
      } else if (typeof err.status === 'number') {
        showToast(err.message || 'Registration failed. Try again.', 'error');
      } else {
        showToast('Could not reach the server. Is it running?', 'error');
      }
    } finally {
      setRegLoading(false);
    }
  }

  async function handleVerifyRegisterSubmit(e) {
    e.preventDefault();
    const code = regOtp.join('');
    if (code.length !== OTP_LENGTH) {
      setRegOtpError('Enter all 6 digits.');
      return;
    }
    if (regOtpExpiresAt && regNow >= regOtpExpiresAt) {
      setRegOtpError('That code has expired. Request a new one.');
      return;
    }

    setVerifying(true);
    setRegOtpError('');
    try {
      await verifyRegistrationOtp(verificationEmail, code);
      showToast('Your account has been created successfully. You can now sign in.', 'success');
      setTimeout(() => {
        onSwitchMode();
      }, 1200);
    } catch (err) {
      setRegOtpError(err.message || 'Verification failed. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendRegisterCode() {
    if (regNow < regResendAvailableAt || resending) return;

    setResending(true);
    try {
      await resendRegistrationOtp(verificationEmail);
      setRegOtp(Array(OTP_LENGTH).fill(''));
      setRegOtpError('');
      setRegOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setRegResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setRegOtpBoxKey((k) => k + 1);
      showToast('A new code has been sent.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not resend the code. Try again.', 'error');
    } finally {
      setResending(false);
    }
  }

  if (!isLogin && stage === 'otp') {
    return (
      <>
        <div className="login-card-header">
          <h2>Verify your email</h2>
          <p>We've sent a verification code to <strong>{maskEmail(verificationEmail)}</strong></p>
        </div>

        <form className="login-form" onSubmit={handleVerifyRegisterSubmit} noValidate>
          <div className={`field${regOtpError ? ' has-error' : ''}`}>
            <label htmlFor="reg-otp-0">Verification code</label>
            <OtpInput
              key={regOtpBoxKey}
              value={regOtp}
              onChange={(next) => {
                setRegOtp(next);
                setRegOtpError('');
              }}
              idPrefix="reg-otp"
            />
            <span className="field-error" style={{ display: regOtpError ? 'block' : 'none' }}>
              {regOtpError}
            </span>
            <span className="otp-expiry">
              {regOtpExpired ? 'Code expired.' : `Code expires in ${formatCountdown(regSecondsUntilExpiry)}`}
            </span>
          </div>

          <button type="submit" className={`btn-submit${verifying ? ' loading' : ''}`} disabled={verifying}>
            <span className="btn-text">Verify code</span>
            <span className="btn-spinner">
              <span className="spinner-ring"></span>
            </span>
          </button>
        </form>

        <div className="signup-row">
          <button
            type="button"
            className="link-button"
            onClick={handleResendRegisterCode}
            disabled={regSecondsUntilResend > 0 || resending}
          >
            {regSecondsUntilResend > 0 ? `Resend code (${regSecondsUntilResend}s)` : 'Resend code'}
          </button>
          {' · '}
          <button type="button" className="link-button" onClick={() => setStage('form')}>
            Back to registration
          </button>
        </div>

        <Toast {...toast} />
      </>
    );
  }

  if (isLogin && unverifiedEmail) {
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

  if (isLogin) {
    return (
      <>
        <form className="login-form" onSubmit={handleLoginSubmit} noValidate>

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
              <Mail size={18} className="input-icon" />
            </div>
            <span className="field-error" style={{ display: emailError ? 'block' : 'none' }}>
              {emailError || 'Enter a valid email address.'}
            </span>
          </div>

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

          <button type="submit" className={`btn-submit${loading ? ' loading' : ''}`}>
            <span className="btn-text">
              Continue
              <ArrowRight size={17} />
            </span>
            <span className="btn-spinner">
              <span className="spinner-ring"></span>
            </span>
          </button>

          <div className="divider">or</div>

          <button type="button" className="btn-social" onClick={handleGoogleClick}>
            <span className="btn-social-label">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" >
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Continue with Google</span>
            </span>
            <ArrowRight size={16} className="btn-social-arrow" />
          </button>
          <div className="signup-row">
            New here?{' '}
            <button type="button" className="link-button" onClick={onSwitchMode}>
              Create a free account
            </button>
          </div>

        </form>

        <Toast {...toast} />
      </>
    );
  }

  return (
    <div className="rf-scope">
      <form className="signup-form" onSubmit={handleRegisterSubmit} noValidate>

        <div className={`field${errors.firstName ? ' has-error' : ''}`} id="field-firstname">
          <label htmlFor="firstname">First name</label>
          <div className="input-wrap">
            <input
              type="text"
              id="firstname"
              name="firstname"
              placeholder="Juan"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                clearError('firstName');
              }}
            />
            <User size={18} className="input-icon" />
          </div>
          <span className="field-error" style={{ display: errors.firstName ? 'block' : 'none' }}>
            {errors.firstName}
          </span>
        </div>

        <div className={`field${errors.lastName ? ' has-error' : ''}`} id="field-lastname">
          <label htmlFor="lastname">Last name</label>
          <div className="input-wrap">
            <input
              type="text"
              id="lastname"
              name="lastname"
              placeholder="dela Cruz"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                clearError('lastName');
              }}
            />
            <User size={18} className="input-icon" />
          </div>
          <span className="field-error" style={{ display: errors.lastName ? 'block' : 'none' }}>
            {errors.lastName}
          </span>
        </div>

        <div className={`field${errors.email ? ' has-error' : ''}`} id="field-email">
          <label htmlFor="email">Email address</label>
          <div className="input-wrap">
            <input
              type="email"
              id="email"
              name="email"
              placeholder="you@email.com"
              autoComplete="email"
              value={regEmail}
              onChange={(e) => {
                setRegEmail(e.target.value);
                clearError('email');
              }}
            />
            <Mail size={18} className="input-icon" />
          </div>
          <span className="field-error" style={{ display: errors.email ? 'block' : 'none' }}>
            {errors.email || 'Enter a valid email address.'}
          </span>
        </div>

        <div className={`field${errors.password ? ' has-error' : ''}`} id="field-password">
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            name="password"
            placeholder="Create a password"
            autoComplete="new-password"
            value={regPassword}
            onChange={(e) => {
              setRegPassword(e.target.value);
              clearError('password');
            }}
            error={errors.password}
          >
            <PasswordRequirementsList password={regPassword} />
          </PasswordInput>
        </div>

        <div className={`field${errors.confirm ? ' has-error' : ''}`} id="field-confirm">
          <label htmlFor="confirm">Confirm password</label>
          <PasswordInput
            id="confirm"
            name="confirm"
            placeholder="Re-enter your password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clearError('confirm');
            }}
            error={errors.confirm}
          />
        </div>

        <div className="terms-row">
          <input
            type="checkbox"
            id="terms-input"
            name="terms"
            checked={terms}
            onChange={() => {}}
            style={{ display: 'none' }}
          />
          <div
            className={`custom-check${terms ? ' checked' : ''}`}
            role="checkbox"
            aria-checked={terms}
            tabIndex={0}
            onClick={() => {
              setTerms((t) => !t);
              clearError('terms');
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setTerms((t) => !t);
                clearError('terms');
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
          <label htmlFor="terms-input" className="terms-label">
            I agree to the <a href="#">Terms of Service</a> and{' '}
            <a href="#">Privacy Policy</a>.
          </label>
        </div>
        <span
          className="field-error"
          style={{ display: errors.terms ? 'block' : 'none', marginTop: '-.5rem' }}
        >
          {errors.terms || 'You must accept the terms to continue.'}
        </span>

        <button
          type="submit"
          className={`btn-submit${regLoading ? ' loading' : ''}`}
          disabled={!terms || regLoading}
        >
          <span className="btn-text">Create account</span>
          <span className="btn-spinner">
            <span className="spinner-ring"></span>
          </span>
        </button>

        <div className="divider">or</div>

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
            <span>Sign up with Google</span>
          </span>
          <ArrowRight size={16} className="btn-social-arrow" />
        </button>

        <div className="login-row">
          Already have an account?{' '}
          <button type="button" className="link-button" onClick={onSwitchMode}>
            Log in
          </button>
        </div>

      </form>

      <Toast {...toast} />
    </div>
  );
}

export default AuthForm;