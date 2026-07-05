const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  price:    { type: Number, required: true, min: 0 }, // unit price at time of sale
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const saleSchema = new mongoose.Schema({
  items:    { type: [saleItemSchema], required: true, validate: v => v.length > 0 },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  total:    { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ["Cash", "GCash", "Maya"], default: "Cash" },
  // Optional link to a room booking, e.g. ringing up extra food/drinks for a
  // guest already occupying a room — purely informational, never required.
  room:     { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
  booking:  { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
  note:     { type: String, default: "" },
  cashier:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status:   { type: String, enum: ["Completed", "Voided"], default: "Completed" },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  voidedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

saleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Sale", saleSchema);
