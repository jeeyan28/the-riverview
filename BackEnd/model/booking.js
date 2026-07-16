const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  // Customer-facing reservation reference — generated once at creation
  // (see saveWithReservationCode() in utils/bookingHelper.js), immutable
  // afterward, and used everywhere a booking is displayed (receipt,
  // booking success screen, admin list/search). Never the Mongo `_id`.
  // Format: PPP-YYMMDD-NNNNN (e.g. BIL-260718-00123) — PPP = first 3
  // letters of the facility name, YYMMDD = creation date, NNNNN = a
  // running number that resets daily per facility.
  reservationCode: { type: String, required: true, unique: true, immutable: true },
  guestName:     { type: String, required: true, trim: true },
  guestContact:  { type: String, default: "" },
  guestEmail:    { type: String, default: "", trim: true },
  guestCount:    { type: Number, default: 1, min: 1 },
  // Free-text note/comment the guest can leave when booking (e.g. "please
  // prepare extra chairs", "birthday celebration setup needed"). Shown to
  // admins under "Additional Notes" in the Booking Details view.
  specialRequests: { type: String, default: "", trim: true, maxlength: 500 },
  room:          { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  roomLabel:     { type: String, required: true },
  variantLabel:  { type: String, default: null },
  date:          { type: String, required: true },
  timeIn:        { type: String, required: true },
  // Public/online bookings are still restricted to whole hours between 1 and 5
  // (enforced in utils/bookingHelper.js). Admin/walk-in bookings — in particular
  // Room Monitoring — are allowed much finer-grained durations (down to 1 second,
  // up to 24 hours) so staff can manage a session down to the hour/minute/second;
  // that finer admin-only range is why the schema bound itself is loosened here.
  duration:      { type: Number, required: true, min: 1 / 3600, max: 24 },
  amount:        { type: Number, required: true, min: 0 },
  // "Pending Payment Verification" / "Confirmed" / "Rejected" are the online-booking
  // lifecycle (down payment -> admin verifies screenshot -> Confirmed/Rejected).
  // "Pending" / "Active" / "Done" / "Overdue" remain for admin-created walk-in /
  // manual bookings (Manual Booking modal / Room Monitoring), which skip payment
  // verification entirely. "Cancelled" applies to either path.
  // "Awaiting Online Payment" = a PayMongo Payment Intent has been created
  // for this booking but the customer hasn't finished paying (or PayMongo's
  // webhook hasn't confirmed it) yet. It auto-advances to "Confirmed" the
  // moment PayMongo confirms payment (no admin review) — see
  // routes/paymongoRoutes.js.
  status:        {
    type: String,
    enum: ["Pending", "Pending Payment Verification", "Awaiting Online Payment", "Confirmed", "Rejected", "Active", "Done", "Overdue", "Cancelled"],
    default: "Pending"
  },
  // Tracks down-payment verification separately from overall booking status,
  // since the admin dashboard needs to show/filter on these independently.
  paymentStatus: {
    type: String,
    enum: ["Unpaid", "Pending Verification", "Paid", "Rejected"],
    default: "Unpaid"
  },
  downPayment:       { type: Number, default: 0, min: 0 },
  paymentScreenshot: { type: String, default: "" }, // Cloudinary URL of the uploaded proof-of-payment
  // No enum restriction here (Cash/walk-in aside, this now also holds whatever
  // name an admin gives a payment method in Settings > Payment Methods — e.g.
  // "GCash", "Maya", or a wallet added later) — the admin UI is the source of
  // truth for which names are valid/active, not a hardcoded list here.
  paymentMethod: { type: String, default: "Cash", trim: true },
  // "manual" = old GCash/Maya-style flow: customer scans a QR and uploads a
  // screenshot for an admin to review (paymentProofUpload/paymentScreenshot
  // above — kept fully intact for any future manual method). "paymongo" =
  // embedded flow: card is entered directly in BookingModal.jsx (tokenized
  // client-side, never touches this server) or GCash/Maya/QRPh is
  // authorized in a popup; the booking is confirmed automatically by
  // PayMongo's webhook, with no screenshot and no admin review.
  // See routes/paymongoRoutes.js.
  paymentProvider: { type: String, enum: ["manual", "paymongo"], default: "manual" },
  // PayMongo Payment Intent id (e.g. "pi_..."), set when a booking is
  // created through the embedded-payment path. Used to match incoming
  // webhook events back to this booking, and as a fallback to re-query
  // PayMongo's API directly if the webhook is delayed.
  // No `default: ""` — left unset for non-PayMongo (walk-in) bookings so the
  // unique+sparse index below only applies to bookings that actually went
  // through PayMongo, and can't collide on an empty string.
  paymongoPaymentIntentId: { type: String, index: { unique: true, sparse: true } },
  // The intent's own client_key — not secret (PayMongo hands this to
  // clients by design). No longer populated on new bookings (the booking
  // itself is now only created after payment already succeeded, so there's
  // nothing left to attach); field kept for any pre-existing bookings/tooling
  // that reads it.
  paymongoClientKey: { type: String, default: "" },
  // Populated once PayMongo reports which underlying payment settled the
  // payment intent (informational / support use only).
  paymongoPaymentId: { type: String, default: "" },
  // "online" = customer self-service booking through the public site (requires down
  // payment + screenshot verification, OR an automatic PayMongo payment).
  // "walk-in" = created by an admin/staff account (Manual Booking modal or
  // Room Monitoring). Room Monitoring must ONLY ever show "walk-in" bookings,
  // never "online" ones.
  source:        { type: String, enum: ["online", "walk-in"], default: "online" },
  // Every booking now requires a logged-in session (customer or admin), so we
  // can record who made it. Not `required` on the schema itself so any
  // pre-existing bookings created before this change don't fail validation.
  bookedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin who approved/rejected the payment
  reviewedAt:    { type: Date },
  createdAt:     { type: Date, default: Date.now }
});

bookingSchema.index({ room: 1, date: 1 });

module.exports = mongoose.model("Booking", bookingSchema);