const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const Booking = require('./booking');

const eventSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  action: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String, maxlength: 500 },
  evidence: { type: String, maxlength: 180 },
}, { _id: false });
const schema = new mongoose.Schema({
  _id: { type: String, default: () => `rv-${randomUUID()}` },
  provider: { type: String, enum: ['paymongo', 'xendit', 'demo'], required: true },
  flowKey: { type: String, required: true, unique: true },
  clientKey: { type: String, required: true },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  hold: { type: mongoose.Schema.Types.ObjectId, ref: 'BookingLock' },
  fingerprint: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  expectedMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, enum: ['PHP'], default: 'PHP' },
  providerId: { type: String },
  paymentId: { type: String },
  redirectUrl: String,
  state: { type: String, enum: ['unpaid', 'pending', 'paid', 'failed', 'expired', 'uncertain'], default: 'unpaid' },
  issue: { type: String, enum: ['', 'provider_uncertain', 'paid_unbooked', 'verification_mismatch', 'refund_attention'], default: '' },
  errorCategory: String,
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  resolution: { type: String, enum: ['open', 'booked', 'refunded', 'evidence_recorded'], default: 'open' },
  receivedMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  refundedMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  closureRefund: { type: Booking.schema.path('closureRefund').schema, default: undefined },
  verifiedAt: Date,
  expiresAt: Date,
  nextCheckAt: Date,
  events: [eventSchema],
}, { timestamps: true });
schema.index({ provider: 1, providerId: 1 }, { unique: true, partialFilterExpression: { providerId: { $type: 'string' } } });
schema.index({ provider: 1, paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } });
schema.index({ bookedBy: 1, clientKey: 1 }, { unique: true });
schema.index({ state: 1, nextCheckAt: 1 });
schema.index({ 'closureRefund.status': 1, 'closureRefund.nextCheckAt': 1 });
schema.index({ 'closureRefund.providerRefundId': 1 }, { sparse: true });
module.exports = mongoose.model('PaymentAttempt', schema);
