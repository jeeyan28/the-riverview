const mongoose = require("mongoose");
const { PENDING_REGISTRATION_EXPIRY_MS } = require("../utils/otp");

// Holds a registration attempt until its OTP is verified. Verified data is
// copied into a real User document (Part 7); this record is deleted at that
// point. If it's abandoned instead, Mongo's TTL index below removes it
// automatically so unverified signups don't pile up indefinitely.
const pendingRegistrationSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  // Hashed the same way model/user.js hashes User.password (bcrypt, cost 10),
  // so Part 7 can copy it straight onto the new User without re-hashing.
  passwordHash: { type: String, required: true },

  otpHash:        { type: String, required: true },
  otpExpires:      { type: Date, required: true },
  otpAttempts:     { type: Number, default: 0 }, // failed verification attempts against the current OTP (Part 6 caps this)
  otpResendCount:  { type: Number, default: 0 }, // OTP-issuing requests within the current otpWindowStart window (Part 6 caps this)
  otpWindowStart:  { type: Date, default: Date.now }, // start of the current 1-hour OTP-request window (Part 6)

  createdAt: { type: Date, default: Date.now },
});

// Auto-delete after PENDING_REGISTRATION_EXPIRY_MS regardless of OTP activity,
// so an abandoned signup doesn't hold its email address hostage forever.
pendingRegistrationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: PENDING_REGISTRATION_EXPIRY_MS / 1000 }
);

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema);