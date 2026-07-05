const mongoose = require("mongoose");

// One holiday / closure date. `date` is stored as "YYYY-MM-DD" (same string
// format bookingRoutes.js already uses for Booking.date) so it can be
// compared directly against a booking date without any timezone parsing.
const holidaySchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  date:    { type: String, required: true }, // "YYYY-MM-DD"
  fullDay: { type: Boolean, default: true },
  note:    { type: String, default: "" },
}, { timestamps: true });

// A homepage announcement/promo banner entry. Only `isActive` ones (and, if
// `expiresAt` is set, not-yet-expired ones) are ever sent to the public
// GET /api/settings endpoint's `announcements` list — see settingsRoutes.js.
const announcementSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true },
  message:   { type: String, required: true, trim: true },
  emoji:     { type: String, default: "📣" },
  isActive:  { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

// Operating hours are a single shared schedule for the whole business
// (not per-room) — matches the "Operating Schedule" card already in the
// admin Settings UI. `openDays` uses 0=Sunday..6=Saturday (JS Date.getDay()).
const operatingHoursSchema = new mongoose.Schema({
  openTime:  { type: String, default: "06:00" }, // "HH:MM", 24h
  closeTime: { type: String, default: "22:00" },
  openDays:  { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  maxAdvanceDays:      { type: Number, default: 30 },
  bookingCutoffHours:  { type: Number, default: 2 },
}, { _id: false });

// A customer-facing down-payment option shown on the booking page (e.g.
// "GCash", "Maya", or any wallet/bank the business adds later). `qrImage`
// is a Cloudinary URL (uploaded via the admin Settings > Payment Methods
// UI) that the customer scans to pay. Only `isActive` methods are ever
// sent to the public GET /api/settings endpoint, so disabling one here
// immediately removes its button from the live booking flow without
// deleting its history/QR.
const paymentMethodSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  qrImage:  { type: String, default: "" }, // Cloudinary URL
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// The whole app only ever needs ONE settings document. We enforce that with
// a fixed singleton id ("global") rather than a unique-index-on-nothing
// trick, so `Settings.getSingleton()` can always findOrCreate deterministically.
const settingsSchema = new mongoose.Schema({
  _id:            { type: String, default: "global" },
  operatingHours: { type: operatingHoursSchema, default: () => ({}) },
  holidays:       { type: [holidaySchema], default: [] },
  announcements:  { type: [announcementSchema], default: [] },
  paymentMethods: { type: [paymentMethodSchema], default: [] },
  updatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedAt:      { type: Date, default: Date.now },
});

settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findById("global");
  if (!doc) {
    doc = await this.create({ _id: "global" });
  }
  // Backfill the two payment methods the booking flow already hardcoded
  // (GCash/Maya, pointing at the QR images already shipped in
  // FrontEnd/assets/pictures/) so existing installs keep working exactly
  // as before the very first time this runs, with nothing extra to do.
  // Admins can then edit/replace/disable them from the new admin UI.
  if (!doc.paymentMethods || doc.paymentMethods.length === 0) {
    doc.paymentMethods = [
      { name: "GCash", qrImage: "assets/pictures/gcash-qr.png", isActive: true },
      { name: "Maya",  qrImage: "assets/pictures/maya-qr.png",  isActive: true },
    ];
    await doc.save();
  }
  return doc;
};

module.exports = mongoose.model("Settings", settingsSchema);
