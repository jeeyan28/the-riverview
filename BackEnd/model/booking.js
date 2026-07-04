const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  guestName:     { type: String, required: true, trim: true },
  guestContact:  { type: String, default: "" },
  room:          { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  roomLabel:     { type: String, required: true },
  variantLabel:  { type: String, default: null },
  date:          { type: String, required: true },
  timeIn:        { type: String, required: true },
  duration:      { type: Number, required: true, min: 1 },
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