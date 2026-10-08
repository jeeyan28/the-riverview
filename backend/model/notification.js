const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  reservationCode: { type: String, default: '' },
  type: { type: String, enum: ["closure", "rescheduled", "reopened", "refund_processing", "refund_completed", "refund_attention"], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  details: {
    guestName: String, roomLabel: String, variantLabel: String,
    date: String, timeIn: String, duration: Number,
    closureDate: String, closureName: String, closureNote: String,
    refundAmount: Number, paymentMethod: String,
  },
  readAt: { type: Date, default: null },
  email: { type: String, default: "" },
  emailStatus: { type: String, enum: ["pending", "sending", "sent", "skipped", 'attention'], default: "pending" },
  emailAttempts: { type: Number, default: 0 },
  emailRetryAt: { type: Date, default: Date.now },
  emailSentAt: Date,
  emailLastError: String,
  createdAt: { type: Date, default: Date.now },
});
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ emailStatus: 1, emailRetryAt: 1 });
module.exports = mongoose.model("Notification", notificationSchema);
