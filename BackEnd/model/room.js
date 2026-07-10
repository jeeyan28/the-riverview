const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  price: { type: Number, min: 0 },
  pax:   { type: String, trim: true } // e.g. "6 pax", "Up to 15"
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true }, // the specific facility's own name/identity, e.g. "VIP Room 1"
  roomNumber:  { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  price:       { type: Number, default: 0, min: 0 }, // fallback rate, used only if no pricing tiers exist
  // Maximum number of guests (pax) this facility can hold. 0/unset means "no
  // limit enforced" so existing rooms created before this field don't
  // suddenly block bookings until an admin sets a real number. Used by
  // validateAndPriceBooking() (utils/bookingHelper.js) to reject a booking
  // whose guestCount exceeds it, and by the public booking page to cap the
  // Pax selector per room.
  capacity:    { type: Number, default: 0, min: 0 },
  status:      {
    type: String,
    enum: ["Available", "Occupied", "Under Maintenance", "Inactive"],
    default: "Available"
  },
  features:    [{ type: String }],
  variants:    [variantSchema],
  image:       { type: String, default: "" },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("Room", roomSchema);