import { useState } from 'react';
import PasswordInput from './PasswordInput';
import PasswordRequirementsList from './PasswordRequirementsList';
import Toast from './Toast';
import OtpInput from './OtpInput';
import { useToast } from '../hooks/useToast';
import { useCountdownClock } from '../hooks/useCountdownClock';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useAuth } from '../context/AuthContext';
import { OTP_LENGTH, OTP_EXPIRY_SECONDS, RESEND_COOLDOWN_SECONDS, formatCountdown } from '../utils/otp';
import { isPasswordStrongEnough } from '../utils/password';
import { validateName, normalizeName } from '../utils/name';
import '../styles/register.css';

// "j***@gmail.com" style mask, per FEATURE_REQUESTS.md Part 4.
function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return email || '';
  return `${local[0]}***@${domain}`;
}

function RegisterForm({ onSwitchToLogin }) {
  const { register, loginWithGoogle, verifyRegistrationOtp, resendRegistrationOtp } = useAuth();
  const { toast, showToast } = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  // 'form' = the registration fields; 'otp' = verification view shown after
  // a successful /register call (account isn't created yet — see Part 5/7).
  const [stage, setStage] = useState('form');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [otpBoxKey, setOtpBoxKey] = useState(0);
  const now = useCountdownClock(stage === 'otp');

  const secondsUntilExpiry = otpExpiresAt ? Math.max(0, Math.ceil((otpExpiresAt - now) / 1000)) : 0;
  const secondsUntilResend = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;
  const otpExpired = otpExpiresAt > 0 && secondsUntilExpiry === 0;

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

  const passwordValid = isPasswordStrongEnough(password);

  async function handleGoogleCredential(response) {
    try {
      // Same unconditional rememberMe=true as LoginForm's Google handler —
      // there is no "remember me" checkbox on this form to read from.
      const user = await loginWithGoogle(response.credential, true);
      showToast('Welcome! Redirecting…', 'success');
      setTimeout(() => {
        const isAdmin = ['staff', 'manager', 'super_admin'].includes(user.role);
        window.location.href = isAdmin ? '/admin/dashboard' : '/';
      }, 1200);
    } catch (err) {
      showToast(err.message || 'Google sign-up failed.', 'error');
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

    const firstNameError = validateName(firstName, 'First name');
    const lastNameError = validateName(lastName, 'Last name');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    const passOk = passwordValid;
    const confirmOk = password === confirm;

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

    setLoading(true);
    try {
      const data = await register({
        firstName: normalizeName(firstName),
        lastName: normalizeName(lastName),
        email: trimmedEmail,
        password,
      });
      // The account isn't created yet — /register only staged a
      // PendingRegistration and emailed an OTP (Part 3). Stay on this card
      // and switch to the verification view; Part 4 builds out the actual
      // 6-box input here.
      setVerificationEmail(data.email || trimmedEmail);
      setOtp(Array(OTP_LENGTH).fill(''));
      setOtpError('');
      setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpBoxKey((k) => k + 1);
      setStage('otp');
    } catch (err) {
      // register() attaches a numeric `.status` for any server-rejected
      // attempt — its absence means the fetch itself never got a response.
      if (err.status === 409) {
        // Duplicate email: highlight the field inline instead of a toast,
        // per FEATURE_REQUESTS.md Part 2 ("Highlight the email field").
        setErrors((prev) => ({
          ...prev,
          email: err.message || 'An account with this email already exists.',
        }));
      } else if (err.field && Object.prototype.hasOwnProperty.call(errors, err.field)) {
        // Backend now names which field it's rejecting (firstName, lastName,
        // email, password) — show it inline next to that field instead of a
        // generic toast, same as the 409 case above.
        setErrors((prev) => ({ ...prev, [err.field]: err.message }));
      } else if (typeof err.status === 'number') {
        showToast(err.message || 'Registration failed. Try again.', 'error');
      } else {
        showToast('Could not reach the server. Is it running?', 'error');
      }
    } finally {
      setLoading(false);
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
    setOtpError('');
    try {
      // Backend creates the verified User and deletes the PendingRegistration
      // in this same call (see routes/auth.js POST /register/verify-otp).
      await verifyRegistrationOtp(verificationEmail, code);
      showToast('Your account has been created successfully. You can now sign in.', 'success');
      setTimeout(() => {
        onSwitchToLogin();
      }, 1200);
    } catch (err) {
      // Keep the user on this screen per FEATURE_REQUESTS.md Part 5 — only
      // a successful verification leaves the OTP view.
      setOtpError(err.message || 'Verification failed. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  // Resend rate limiting is enforced server-side (Part 6: 60s cooldown +
  // 5/hour per-email cap) — this local check just avoids a pointless
  // request while the button is already disabled.
  async function handleResend() {
    if (now < resendAvailableAt || resending) return;

    setResending(true);
    try {
      await resendRegistrationOtp(verificationEmail);
      setOtp(Array(OTP_LENGTH).fill(''));
      setOtpError('');
      setOtpExpiresAt(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpBoxKey((k) => k + 1);
      showToast('A new code has been sent.', 'success');
    } catch (err) {
      // A 429 here means the server-side cap (cooldown or 5/hour) kicked
      // in even though the local button was enabled — surface it as-is.
      showToast(err.message || 'Could not resend the code. Try again.', 'error');
    } finally {
      setResending(false);
    }
  }

  if (stage === 'otp') {
    // Renders with the same classes LoginForm's own OTP-like view uses
    // (login-card-header / login-form / signup-row from login.css) instead
    // of rf-scope's own otp-view-header/signup-form/login-row, so this
    // screen is styled identically to the Login card — not a reimplementation.
    return (
      <>
        <div className="login-card-header">
          <h2>Verify your email</h2>
          <p>We've sent a verification code to <strong>{maskEmail(verificationEmail)}</strong></p>
        </div>

        <form className="login-form" onSubmit={handleVerifySubmit} noValidate>
          <div className={`field${otpError ? ' has-error' : ''}`}>
            <label htmlFor="reg-otp-0">Verification code</label>
            <OtpInput
              key={otpBoxKey}
              value={otp}
              onChange={(next) => {
                setOtp(next);
                setOtpError('');
              }}
              idPrefix="reg-otp"
            />
            <span className="field-error" style={{ display: otpError ? 'block' : 'none' }}>
              {otpError}
            </span>
            <span className="otp-expiry">
              {otpExpired ? 'Code expired.' : `Code expires in ${formatCountdown(secondsUntilExpiry)}`}
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
            onClick={handleResend}
            disabled={secondsUntilResend > 0 || resending}
          >
            {secondsUntilResend > 0 ? `Resend code (${secondsUntilResend}s)` : 'Resend code'}
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

  return (
    <div className="rf-scope">
      <form className="signup-form" onSubmit={handleSubmit} noValidate>

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
            <span className="input-icon">👤</span>
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
            <span className="input-icon">👤</span>
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
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError('email');
              }}
            />
            <span className="input-icon">✉</span>
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
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError('password');
            }}
            error={errors.password}
          >
            <PasswordRequirementsList password={password} />
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
          className={`btn-submit${loading ? ' loading' : ''}`}
          disabled={!terms || loading}
        >
          <span className="btn-text">Create account</span>
          <span className="btn-spinner">
            <span className="spinner-ring"></span>
          </span>
        </button>

        <div className="divider">or</div>

        <button type="button" className="btn-social" onClick={handleGoogleClick}>
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
          Sign up with Google
        </button>

        <div className="login-row">
          Already have an account?{' '}
          <button type="button" className="link-button" onClick={onSwitchToLogin}>
            Log in
          </button>
        </div>

      </form>

      <Toast {...toast} />
    </div>
  );
}

export default RegisterForm;