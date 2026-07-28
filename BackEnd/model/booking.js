const mongoose = require("mongoose");

// Single source of truth for booking duration bounds. bookingHelper.js's
// admin-booking cap check reads MAX_DURATION_HOURS from here instead of
// repeating the literal.
const MIN_DURATION_HOURS = 1 / 3600; // 1 second
const MAX_DURATION_HOURS = 24;

// Single source of truth for status/paymentStatus values. bookingRoutes.js
// and forecastRoutes.js read from these instead of retyping the strings.
const BOOKING_STATUS = {
  PENDING: "Pending",
  PENDING_PAYMENT_VERIFICATION: "Pending Payment Verification",
  AWAITING_ONLINE_PAYMENT: "Awaiting Online Payment",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  ACTIVE: "Active",
  DONE: "Done",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

const PAYMENT_STATUS = {
  UNPAID: "Unpaid",
  PENDING_VERIFICATION: "Pending Verification",
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
  paymentScreenshot: { type: String, default: "" }, 
  paymentMethod: { type: String, default: "Cash", trim: true },
  paymentProvider: { type: String, enum: ["manual", "paymongo"], default: "manual" },
  paymongoPaymentIntentId: { type: String, index: { unique: true, sparse: true } },
  paymongoClientKey: { type: String, default: "" },
  paymongoPaymentId: { type: String, default: "" },
  source:        { type: String, enum: ["online", "walk-in"], default: "online" },
  bookedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin who approved/rejected the payment
  reviewedAt:    { type: Date },
  createdAt:     { type: Date, default: Date.now }
});

bookingSchema.index({ room: 1, date: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
module.exports.MIN_DURATION_HOURS = MIN_DURATION_HOURS;
module.exports.MAX_DURATION_HOURS = MAX_DURATION_HOURS;
module.exports.BOOKING_STATUS = BOOKING_STATUS;
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;