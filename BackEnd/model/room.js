const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  price: { type: Number, min: 0 },
  pax:   { type: String, trim: true } // e.g. "6 pax", "Up to 15"
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true }, // the specific facility's own name/identity, e.g. "VIP Room 1"
  // Tier 4: which Category this facility belongs to (e.g. "VIP", "Family Suite").
  // Optional/nullable on purpose — this field did not exist before Tier 4, so
  // every room saved before this migration has category: null until it's
  // explicitly assigned (see scripts/migrate-room-categories.js).
  // Nothing about `name`, `roomNumber`, `price`, etc. changes or is removed.
  category:     { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
  // Denormalized snapshot of the category's name at the time it was assigned,
  // kept in sync by routes/categoryRoutes.js on rename. This means a room
  // still shows a readable category label even if the Category document is
  // later deleted, and old API consumers that only read strings (not refs)
  // keep working without needing to populate() anything.
  categoryName: { type: String, trim: true, default: "" },
  roomNumber:  { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  price:       { type: Number, default: 0, min: 0 }, // fallback rate, used only if no pricing tiers exist
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