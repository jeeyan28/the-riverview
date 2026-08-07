const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  price: { type: Number, min: 0 },
  pax:   { type: String, trim: true },
  startingRoomNumber: { type: Number, min: 1, default: 1 },
  roomCount: { type: Number, min: 1, default: 1,},
  status: { type: String, enum: ["Available", "Maintenance", "Unavailable"], default: "Available" },
  image:       { type: String, default: "" },
  description: { type: String, default: "" },
  features:    [{ type: String }]
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  price:       { type: Number, default: 0, min: 0 },
  capacity:    { type: Number, default: 0, min: 0 },
  image:       { type: String, default: "" },
  features:    [{ type: String }],
  variants:    [variantSchema],
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("Room", roomSchema);