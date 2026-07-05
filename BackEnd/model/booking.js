const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
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
  duration:      { type: Number, required: true, min: 1, max: 5 },
  amount:        { type: Number, required: true, min: 0 },
  // "Pending Payment Verification" / "Confirmed" / "Rejected" are the online-booking
  // lifecycle (down payment -> admin verifies screenshot -> Confirmed/Rejected).
  // "Pending" / "Active" / "Done" / "Overdue" remain for admin-created walk-in /
  // manual bookings (Manual Booking modal / Room Monitoring), which skip payment
  // verification entirely. "Cancelled" applies to either path.
  status:        {
    type: String,
    enum: ["Pending", "Pending Payment Verification", "Confirmed", "Rejected", "Active", "Done", "Overdue", "Cancelled"],
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
  // "online" = customer self-service booking through the public site (requires down
  // payment + screenshot verification). "walk-in" = created by an admin/staff account
  // (Manual Booking modal or Room Monitoring). Room Monitoring must ONLY ever show
  // "walk-in" bookings, never "online" ones.
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