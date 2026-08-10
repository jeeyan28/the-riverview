const rateLimit = require("express-rate-limit");
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

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Please try again later." },
});

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
  message: { message: "Too many booking requests. Please slow down and try again later." },
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
  registerOtpLimiter,
  guestCreationLimiter,
  guestRecoveryLoginLimiter,
  bookingActionLimiter,
  paymentIntentLimiter,
  paymentAttachLimiter,
};