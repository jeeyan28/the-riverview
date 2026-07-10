import { useEffect, useRef } from 'react';
import { OTP_LENGTH } from '../utils/otp';

// Six-box OTP entry: auto-focuses the first box on mount, advances focus as
// digits are typed, Backspace moves back a box, and pasting a full code
// fills all boxes at once. Shared by ForgotPasswordModal and RegisterForm
// per FEATURE_REQUESTS.md ("do not duplicate ... OTP input component").
function OtpInput({ value, onChange, idPrefix = 'otp', autoFocus = true }) {
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => inputRefs.current[0]?.focus());
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);

  function handleChange(index, rawValue) {
    const digits = rawValue.replace(/\D/g, '');
    const next = [...value];
    next[index] = digits ? digits.slice(-1) : '';
    onChange(next);
    if (digits && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key !== 'Backspace') return;
    if (value[index]) return; // let the normal onChange clear this box first
    if (index === 0) return;
    e.preventDefault();
    const next = [...value];
    next[index - 1] = '';
    onChange(next);
    inputRefs.current[index - 1]?.focus();
  }

  function handlePaste(e) {
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) return;
    e.preventDefault();
    const next = [...value];
    for (let i = 0; i < OTP_LENGTH; i++) next[i] = digits[i] || '';
    onChange(next);
    inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
  }

  return (
    <div className="otp-input-group" onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          id={`${idPrefix}-${i}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          className="otp-input"
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
        />
      ))}
    </div>
  );
}

export default OtpInput;