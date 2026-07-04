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

module.exports = { loginLimiter, forgotPasswordLimiter };
