const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  category:    {
    type: String,
    required: true,
    enum: ["Billiards", "KTV", "Basketball Court", "VIP Package"]
  },
  roomNumber:  { type: String, required: true, trim: true }, // e.g. "Billiards #1", "KTV-01"
  capacity:    { type: String, required: true, trim: true }, // e.g. "15 pax"
  description: { type: String, default: "" },
  price:       { type: Number, required: true, min: 0 },     // ₱ per hour
  status:      {
    type: String,
    enum: ["Available", "Occupied", "Under Maintenance", "Inactive"],
    default: "Available"
  },
  features:    [{ type: String }],
  image:       { type: String, default: "" }, // filename or URL
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("Room", roomSchema);
