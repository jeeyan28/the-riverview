const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  price: { type: Number, min: 0 },
  pax:   { type: String, trim: true }, // e.g. "6 pax", "Up to 15"
  // Optional per-variant overrides for the Booking UI's Room Selection step.
  // Empty/unset means "inherit from the parent room" (image/description/
  // features) — see priceOptionsFor() in BookingModal.jsx.
  image:       { type: String, default: "" },
  description: { type: String, default: "" },
  features:    [{ type: String }]
}, { _id: false });

const roomSchema = new mongoose.Schema({

  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true, },
  name:        { type: String, required: true, trim: true }, // the specific facility's own name/identity, e.g. "VIP Room 1"
  roomNumber:  { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  price:       { type: Number, default: 0, min: 0 }, // fallback rate, used only if no pricing tiers exist
  capacity:    { type: Number, default: 0, min: 0 },
  status:      { type: String, enum: ["Available", "Occupied", "Under Maintenance", "Inactive"], default: "Available" },
  features:    [{ type: String }],
  variants:    [variantSchema],
  image:       { type: String, default: "" },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("Room", roomSchema);