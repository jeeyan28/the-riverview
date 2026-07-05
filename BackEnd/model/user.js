const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Only three admin-facing roles now, on top of the regular "user" (customer) role:
//   staff        — POS + bookings, no room editing
//   manager      — staff's abilities + room management, refunds, reports
//   super_admin  — everything, including managing other admin accounts (this is "owner")
const ROLES = ["user", "staff", "manager", "super_admin"];

const userSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  // Not required at the schema level: Google sign-in may omit the family name,
  // and a Google account can never supply a phone number at all. The manual
  // /api/auth/register route still enforces both as required there, since
  // that's the only place we control the full form.
  lastname:  { type: String, default: "" },
  phone:     { type: String, default: "" },
  email:     { type: String, required: true, unique: true, lowercase: true },
  // Not required anymore: an admin created for Google-only sign-in may have no password.
  password: { type: String, select: false },
  role:      { type: String, enum: ROLES, default: "user" },

  googleId:  { type: String, index: true, sparse: true },

  // --- Login throttling / lockout (applies to staff/manager/super_admin logins) ---
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil:           { type: Date },

  // --- Password reset ---
  resetPasswordToken:   { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },

  isActive:  { type: Boolean, default: true },
  lastLoginAt: { type: Date },

  createdAt: { type: Date, default: Date.now }
});

userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
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