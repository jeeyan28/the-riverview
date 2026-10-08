const mongoose = require("mongoose");

const MAX_ATTEMPTS = 5;
const MAX_MANUAL_RETRIES = 10;
const LEASE_MS = 120000;

const receiptSnapshotSchema = new mongoose.Schema({
  reservationCode: { type: String, required: true },
  guestName: String,
  guestContact: String,
  guestEmail: String,
  guestCount: Number,
  roomLabel: String,
  variantLabel: String,
  date: String,
  timeIn: String,
  duration: Number,
  amount: Number,
  paidAmount: Number,
  downPayment: Number,
  paymentChoice: String,
  eligibleDiscount: Number,
  createdAt: Date,
}, { _id: false });

const receiptEventSchema = new mongoose.Schema({
  action: { type: String, enum: ["queued", "sending", "sent", "failed", "lease_expired", "timeout", "retry_requested"], required: true },
  at: { type: Date, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  note: { type: String, maxlength: 500, default: "" },
}, { _id: false });

const receiptJobSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, immutable: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  version: { type: Number, required: true, min: 1, immutable: true },
  reservationCode: { type: String, required: true, immutable: true },
  recipient: { type: String, maxlength: 254, default: "" },
  snapshot: { type: receiptSnapshotSchema, required: true },
  messageId: { type: String, required: true, immutable: true },
  state: { type: String, enum: ["pending", "sending", "sent", "attention"], required: true, default: "pending" },
  attempts: { type: Number, min: 0, max: MAX_ATTEMPTS, default: 0 },
  totalAttempts: { type: Number, min: 0, max: MAX_ATTEMPTS * (MAX_MANUAL_RETRIES + 1), default: 0 },
  retryCount: { type: Number, min: 0, max: MAX_MANUAL_RETRIES, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseToken: { type: String, default: null },
  leaseExpiresAt: { type: Date, default: null },
  lastError: { type: String, maxlength: 500, default: "" },
  lastErrorCode: { type: String, maxlength: 50, default: "" },
  sentAt: { type: Date, default: null },
  history: { type: [receiptEventSchema], default: [] },
}, { timestamps: true });

receiptJobSchema.index({ state: 1, nextAttemptAt: 1 });
receiptJobSchema.index({ state: 1, leaseExpiresAt: 1 });
receiptJobSchema.index({ booking: 1, version: -1 });

module.exports = mongoose.model("ReceiptJob", receiptJobSchema);
module.exports.MAX_ATTEMPTS = MAX_ATTEMPTS;
module.exports.LEASE_MS = LEASE_MS;
