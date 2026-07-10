// Shared OTP UI constants + helpers used by both RegisterForm (email
// verification) and ForgotPasswordModal (password reset), so the two flows
// can't drift out of sync with each other or with the backend.
//
// Must match BackEnd/utils/otp.js — there's no per-request value to read
// these from, since the expiry/cooldown/limits are fixed constants.
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_SECONDS = 5 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_RESEND_ATTEMPTS = 5;   // mirrors backend MAX_OTP_REQUESTS_PER_WINDOW
export const MAX_VERIFY_ATTEMPTS = 5;   // mirrors backend MAX_OTP_VERIFY_ATTEMPTS

export function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}