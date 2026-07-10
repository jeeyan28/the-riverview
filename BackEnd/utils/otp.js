const crypto = require("crypto");

// ── Centralized OTP configuration, shared by Forgot Password, Registration,
// and the Part 8 unverified-login flow. Change a value here and it applies
// everywhere (backend). Frontend/src/utils/otp.js mirrors the display-facing
// subset of these and must be kept in sync manually — there's no shared
// package to import across BackEnd/Frontend.
const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;              // how long a generated OTP stays valid
const RESEND_COOLDOWN_MS = 60 * 1000;           // "Resend Code" cooldown
const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000;   // rolling window for the per-email request cap
const MAX_OTP_REQUESTS_PER_WINDOW = 5;          // max OTP-issuing requests per email per window
const MAX_OTP_VERIFY_ATTEMPTS = 5;              // max wrong guesses against one OTP
const PENDING_REGISTRATION_EXPIRY_MS = 12 * 60 * 60 * 1000; // TTL for an abandoned PendingRegistration

// Uniformly distributed OTP_LENGTH-digit code (avoids the modulo bias of % 10^n).
function generateOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH;
  return crypto.randomInt(min, max).toString();
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

// Compares two equal-length hex hashes in constant time (both are SHA-256
// hex digests here, so length is always 64 unless something is malformed).
function hashesMatch(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Enforces "max MAX_OTP_REQUESTS_PER_WINDOW OTP requests per OTP_REQUEST_WINDOW_MS
// per email" against a PendingRegistration-shaped document (needs
// `otpWindowStart` and `otpResendCount` fields). Mutates the document's
// window/count in place on success — caller is still responsible for calling
// .save(). Does NOT mutate on rejection, so a rejected request leaves the
// existing window untouched.
function checkAndBumpOtpRequestWindow(doc) {
  const now = Date.now();
  const windowStart = doc.otpWindowStart ? doc.otpWindowStart.getTime() : 0;

  if (!windowStart || now - windowStart >= OTP_REQUEST_WINDOW_MS) {
    doc.otpWindowStart = new Date(now);
    doc.otpResendCount = 1;
    return { allowed: true };
  }

  if (doc.otpResendCount >= MAX_OTP_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((windowStart + OTP_REQUEST_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  doc.otpResendCount += 1;
  return { allowed: true };
}

module.exports = {
  OTP_LENGTH,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  OTP_REQUEST_WINDOW_MS,
  MAX_OTP_REQUESTS_PER_WINDOW,
  MAX_OTP_VERIFY_ATTEMPTS,
  PENDING_REGISTRATION_EXPIRY_MS,
  generateOtp,
  hashOtp,
  hashesMatch,
  checkAndBumpOtpRequestWindow,
};