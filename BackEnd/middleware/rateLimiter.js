const rateLimit = require("express-rate-limit");

// IP-based limiter. Works alongside the per-account lockout in model/user.js —
// this stops one IP hammering many different emails; the per-account lockout
// stops repeated guesses against one specific email even from different IPs.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts from this network. Please try again later." },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Please try again later." },
});

// IP-based defense-in-depth for the registration OTP endpoints
// (/register, /register/resend-otp, /register/verify-otp), alongside the
// per-email otpResendCount/otpAttempts caps enforced in routes/auth.js via
// utils/otp.js's checkAndBumpOtpRequestWindow (Part 6). Wider window/count
// than forgotPasswordLimiter since /register also carries normal signup
// traffic, not just OTP requests.
const registerOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this network. Please try again later." },
});

module.exports = { loginLimiter, forgotPasswordLimiter, registerOtpLimiter };