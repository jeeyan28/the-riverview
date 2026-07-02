const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  guestName:     { type: String, required: true, trim: true },
  guestContact:  { type: String, default: "" },
  room:          { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  roomLabel:     { type: String, required: true }, // denormalized name for display, e.g. "Billiards #1"
  category:      { type: String, required: true }, // denormalized category
  date:          { type: String, required: true },  // "2026-07-03"
  timeIn:        { type: String, required: true },  // "17:00"
  duration:      { type: Number, required: true, min: 1 }, // hours
  amount:        { type: Number, required: true, min: 0 },
  status:        {
    type: String,
    enum: ["Pending", "Active", "Done", "Overdue", "Cancelled"],
    default: "Pending"
  },
  paymentMethod: { type: String, enum: ["Cash", "GCash", "Maya"], default: "Cash" },
  createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.model("Booking", bookingSchema);