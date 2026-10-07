const mongoose = require("mongoose");

const LOCK_DURATION_MINUTES = 20;

const bookingLockSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  variantLabel: { type: String, default: null },
  date: { type: String, required: true },
  timeIn: { type: String, required: true },
  duration: { type: Number, required: true },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

bookingLockSchema.index({ room: 1, date: 1 });
bookingLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("BookingLock", bookingLockSchema);
module.exports.LOCK_DURATION_MINUTES = LOCK_DURATION_MINUTES;