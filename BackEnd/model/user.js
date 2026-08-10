const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { LOGIN_LOCKOUT_MAX_ATTEMPTS, LOGIN_LOCKOUT_DURATION_MS } = require("../utils/constants");

const ROLES = ["user", "staff", "manager", "super_admin"];

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  phone:     { type: String, default: "" },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, select: false },
  role:      { type: String, enum: ROLES, default: "user" },

  googleId:  { type: String, index: true, sparse: true },
  googleProfilePicture: { type: String, default: "" },

  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil:           { type: Date },

  resetOtpHash:    { type: String, select: false },
  resetOtpExpires: { type: Date, select: false },
  resetOtpAttempts: { type: Number, default: 0, select: false },
  resetSessionTokenHash:    { type: String, select: false },
  resetSessionTokenExpires: { type: Date, select: false },

  isVerified: { type: Boolean, default: false },
  verifyOtpHash:    { type: String, select: false },
  verifyOtpExpires: { type: Date, select: false },
  verifyOtpAttempts: { type: Number, default: 0, select: false },
  otpWindowStart:  { type: Date, select: false },
  otpResendCount:  { type: Number, default: 0, select: false },

  isActive:  { type: Boolean, default: true },
  lastLoginAt: { type: Date },

  isGuest: { type: Boolean, default: false },
  guestDeletedAt: { type: Date, default: null },
  guestRecoveryEmailHash: { type: String, select: false },
  guestRecoveryPasswordHash: { type: String, select: false },
  guestRecoveryExpiresAt: { type: Date, select: false },
  pendingClaimEmail: { type: String, select: false },
  pendingClaimPasswordHash: { type: String, select: false },

  createdAt: { type: Date, default: Date.now }
});

userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  if (this.$locals.skipPasswordHash) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

userSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

const MAX_ATTEMPTS = LOGIN_LOCKOUT_MAX_ATTEMPTS;
const LOCK_TIME_MS = LOGIN_LOCKOUT_DURATION_MS;
const SALT_ROUNDS = 10;

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
module.exports.SALT_ROUNDS = SALT_ROUNDS;