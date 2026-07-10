const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Only three admin-facing roles now, on top of the regular "user" (customer) role:
//   staff        — POS + bookings, no room editing
//   manager      — staff's abilities + room management, refunds, reports
//   super_admin  — everything, including managing other admin accounts (this is "owner")
const ROLES = ["user", "staff", "manager", "super_admin"];

const userSchema = new mongoose.Schema({
  // Split name fields. Required at the schema level; the manual
  // /api/auth/register route also validates them (see
  // BackEnd/utils/nameValidation.js). Google sign-in always supplies both
  // too (from the Google profile — routes/auth.js's /google).
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  // Not required: Google sign-in can never supply a phone number.
  phone:     { type: String, default: "" },
  email:     { type: String, required: true, unique: true, lowercase: true },
  // Not required anymore: an admin created for Google-only sign-in may have no password.
  password: { type: String, select: false },
  role:      { type: String, enum: ROLES, default: "user" },

  googleId:  { type: String, index: true, sparse: true },
  // Only ever set for Google-linked accounts (see routes/auth.js's /google
  // handler) — Google is the source of truth, refreshed on every Google
  // login same as firstname/lastname. Session-based accounts have no
  // equivalent; the client falls back to a letter-avatar for those.
  googleProfilePicture: { type: String, default: "" },

  // --- Login throttling / lockout (applies to staff/manager/super_admin logins) ---
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil:           { type: Date },

  // --- Password reset (OTP-based) ---
  resetOtpHash:    { type: String, select: false },
  resetOtpExpires: { type: Date, select: false },
  // Per-account wrong-guess counter for the reset OTP, mirroring
  // PendingRegistration.otpAttempts. Reset to 0 whenever a fresh OTP is
  // issued; capped at MAX_OTP_VERIFY_ATTEMPTS in routes/auth.js.
  resetOtpAttempts: { type: Number, default: 0, select: false },
  // Issued once the OTP above is verified; proves verification happened so
  // Part 5's password-reset step doesn't need the OTP again. Single-use,
  // consumed the same way the OTP is.
  resetSessionTokenHash:    { type: String, select: false },
  resetSessionTokenExpires: { type: Date, select: false },

  // Set true only by the registration OTP flow (routes/auth.js
  // POST /register/verify-otp) or by Google sign-in. Gates login (Part 8).
  isVerified: { type: Boolean, default: false },
  // Part 8: lets an existing-but-unverified account (e.g. one created
  // outside the registration OTP flow) receive a fresh code via
  // POST /resend-verification, verified by POST /verify-account-otp.
  // Mirrors resetOtpHash/resetOtpExpires above — same OTP primitives from
  // utils/otp.js, just scoped to a different purpose/pair of fields.
  verifyOtpHash:    { type: String, select: false },
  verifyOtpExpires: { type: Date, select: false },
  // Per-account wrong-guess counter for the account-verification OTP, same
  // pattern as resetOtpAttempts above. Reset to 0 whenever a fresh OTP is
  // issued; capped at MAX_OTP_VERIFY_ATTEMPTS in routes/auth.js.
  verifyOtpAttempts: { type: Number, default: 0, select: false },
  // Per-email hourly resend cap for /resend-verification, same fields/shape
  // PendingRegistration uses so checkAndBumpOtpRequestWindow (utils/otp.js)
  // works unmodified against either document type.
  otpWindowStart:  { type: Date, select: false },
  otpResendCount:  { type: Number, default: 0, select: false },

  isActive:  { type: Boolean, default: true },
  lastLoginAt: { type: Date },

  createdAt: { type: Date, default: Date.now }
});

userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  // Set by routes/auth.js's POST /register/verify-otp: the value being
  // saved is PendingRegistration.passwordHash, already bcrypt-hashed at
  // /register time. Hashing it again here would make it unverifiable.
  if (this.$locals.skipPasswordHash) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

const MAX_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

userSchema.methods.registerFailedLogin = async function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= MAX_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
    this.failedLoginAttempts = 0;
  }
  await this.save();
};

userSchema.methods.registerSuccessfulLogin = async function () {
  this.failedLoginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLoginAt = new Date();
  await this.save();
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;