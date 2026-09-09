const mongoose = require("mongoose");

const MIN_DURATION_HOURS = 1 / 3600;
const MAX_DURATION_HOURS = 24;
const MAX_RESCHEDULES = 2;
const RESCHEDULE_CUTOFF_HOURS = 3;

const BOOKING_STATUS = {
  PENDING: "Pending",
  PENDING_PAYMENT_VERIFICATION: "Pending Payment Verification",
  AWAITING_ONLINE_PAYMENT: "Awaiting Online Payment",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  ONGOING: "Ongoing",
  DONE: "Done",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

const PAYMENT_STATUS = {
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
  REJECTED: "Rejected",
};

const bookingSchema = new mongoose.Schema({
  reservationCode: { type: String, required: true, unique: true, immutable: true },
  guestName:     { type: String, required: true, trim: true },
  guestContact:  { type: String, default: "" },
  guestEmail:    { type: String, default: "", trim: true },
  guestCount:    { type: Number, default: 1, min: 1 },
  specialRequests: { type: String, default: "", trim: true, maxlength: 500 },
  room:          { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  roomLabel:     { type: String, required: true },
  variantLabel:  { type: String, default: null },
  date:          { type: String, required: true },
  timeIn:        { type: String, required: true },
  duration:      { type: Number, required: true, min: MIN_DURATION_HOURS, max: MAX_DURATION_HOURS },
  amount:        { type: Number, required: true, min: 0 },
  roomCharge:    { type: Number, min: 0 },
  hourlyRates:   [{ type: Number, min: 0 }],
  corkageFee:    { type: Number, default: 0, min: 0 },
  status:        {
    type: String,
    enum: Object.values(BOOKING_STATUS),
    default: BOOKING_STATUS.PENDING
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.UNPAID
  },
  downPayment:       { type: Number, default: 0, min: 0 },
  paidAmount:        { type: Number, min: 0 },
  refundedAmount:    { type: Number, default: 0, min: 0 },
  paymentUpdatedAt:  { type: Date },
  cancellationStatus: { type: String, enum: ["None", "Requested", "Approved", "Rejected"], default: "None" },
  cancellationRequestedAt: { type: Date },
  cancellationReason: { type: String, default: "", maxlength: 500 },
  cancellationReviewedAt: { type: Date },
  cancellationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  cancellationReviewNote: { type: String, default: "", maxlength: 500 },
  noShowAt: { type: Date },
  downPaymentHours:  { type: Number, default: 1, min: 1 },
  rescheduleCount:   { type: Number, default: 0, min: 0 },
  paymentScreenshot: { type: String, default: "" },
  paymentMethod: { type: String, default: "Cash", trim: true },
  paymentProvider: { type: String, enum: ["manual", "paymongo"], default: "manual" },
  paymongoPaymentIntentId: { type: String, index: { unique: true, sparse: true } },
  paymongoClientKey: { type: String, default: "" },
  paymongoPaymentId: { type: String, default: "" },
  source:        { type: String, enum: ["online", "walk-in"], default: "online" },
  bookedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt:    { type: Date },
  createdAt:     { type: Date, default: Date.now }
});

bookingSchema.index({ room: 1, date: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
module.exports.MIN_DURATION_HOURS = MIN_DURATION_HOURS;
module.exports.MAX_DURATION_HOURS = MAX_DURATION_HOURS;
module.exports.MAX_RESCHEDULES = MAX_RESCHEDULES;
module.exports.RESCHEDULE_CUTOFF_HOURS = RESCHEDULE_CUTOFF_HOURS;
module.exports.BOOKING_STATUS = BOOKING_STATUS;
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
