const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  price: { type: Number, min: 0 },
  pax:   { type: String, trim: true } // e.g. "6 pax", "Up to 15"
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true }, // this is now the facility identity — no more category
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