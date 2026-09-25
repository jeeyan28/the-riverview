const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { ipKeyGenerator } = rateLimit;
const { GUEST_CREATION_LIMIT_WINDOW_MS, GUEST_CREATION_LIMIT_MAX } = require("../utils/constants");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts from this network. Please try again later." },
});

function resetKey(value) {
  if (!value || typeof value !== "string") return "invalid-reset-request";
  return crypto.createHash("sha256").update(value).digest("hex");
}

function resetEmailKey(req) {
  const email = req.body?.email;
  return resetKey(typeof email === "string" ? email.trim().toLowerCase() : null);
}

function resetSessionKey(req) {
  return resetKey(req.body?.resetSessionToken);
}

function passwordResetLimiter(message, max = 5, keyGenerator = resetEmailKey) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    message: { message },
  });
}

// Limit each email separately so accounts sharing a network do not block one another.
const forgotPasswordLimiter = passwordResetLimiter("This email has reached the limit of 3 password reset code requests per hour. Please try again later.", 3);
const verifyResetOtpLimiter = passwordResetLimiter("Too many verification attempts. Please try again later.");
const resetPasswordLimiter = passwordResetLimiter("Too many password update attempts. Please try again later.", 5, resetSessionKey);

const registerOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this network. Please try again later." },
});

const guestCreationLimiter = rateLimit({
  windowMs: GUEST_CREATION_LIMIT_WINDOW_MS,
  max: GUEST_CREATION_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many guest accounts created from this network. Please try again later." },
});

const guestRecoveryLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many recovery attempts from this network. Please try again later." },
});

function userOrIpKey(req) {
  return req.user?._id ? String(req.user._id) : ipKeyGenerator(req.ip);
}

const bookingActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many reservation requests. Please slow down and try again later." },
});

const paymentIntentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many payment attempts. Please try again later." },
});

const paymentAttachLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many payment attempts. Please try again later." },
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  verifyResetOtpLimiter,
  resetPasswordLimiter,
  registerOtpLimiter,
  guestCreationLimiter,
  guestRecoveryLoginLimiter,
  bookingActionLimiter,
  paymentIntentLimiter,
  paymentAttachLimiter,
};
