const { Joi } = require("../middleware/validate");

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).required();
const name = Joi.string().trim().min(3).max(100).required();
const password = Joi.string().min(8).max(128).required();
const otp = Joi.string().trim().pattern(/^\d{6}$/).required();
const googleCode = Joi.string().trim().min(1).max(8192).required();

const registerSchema = Joi.object({ firstName: name, lastName: name, email, password });
const emailSchema = Joi.object({ email });
const emailOtpSchema = Joi.object({ email, otp });
const otpSchema = Joi.object({ otp });
const guestSchema = Joi.object({ firstName: name, lastName: name });
const guestRecoveryLoginSchema = Joi.object({
  tempEmail: Joi.string().trim().min(1).max(254).required(),
  tempPassword: Joi.string().min(1).max(256).required(),
});
const claimEmailStartSchema = Joi.object({ email, password });
const googleCodeSchema = Joi.object({ code: googleCode });
const loginSchema = Joi.object({ email, password: Joi.string().min(1).max(128).required() });
const resetPasswordSchema = Joi.object({
  resetSessionToken: Joi.string().trim().hex().length(64).required(),
  password,
});
const emptyBodySchema = Joi.object({}).default({});

module.exports = {
  registerSchema,
  emailSchema,
  emailOtpSchema,
  otpSchema,
  guestSchema,
  guestRecoveryLoginSchema,
  claimEmailStartSchema,
  googleCodeSchema,
  loginSchema,
  resetPasswordSchema,
  emptyBodySchema,
};
