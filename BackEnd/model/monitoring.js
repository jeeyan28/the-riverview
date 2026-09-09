const mongoose = require("mongoose");

const monitorRoomSchema = new mongoose.Schema({
  facilityName: { type: String, required: true, trim: true },
  roomName:     { type: String, required: true, trim: true },
  roomNumber:   { type: String, required: true, trim: true },
  price:        { type: Number, default: 0, min: 0 },
  pax:          { type: String, default: "", trim: true },
  pricingMode:  { type: String, enum: ["flat", "time-based"], default: "flat" },
  eveningPrice: { type: Number, min: 0, default: null },
  eveningStartTime: { type: String, default: "17:00" },
  includedGuests: { type: Number, min: 0, default: 0 },
  extraGuestFee: { type: Number, min: 0, default: 0 },
  status:       { type: String, enum: ["Available", "Occupied", "Under Maintenance", "Inactive"], default: "Available" },
  isTemporary:  { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now },
});

const MonitorRoom = mongoose.model("MonitorRoom", monitorRoomSchema);

const roomSessionSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "MonitorRoom", required: true },
  roomNumber: { type: String, required: true, trim: true },
  facilityName: { type: String, trim: true, default: "" },
  roomName: { type: String, trim: true, default: "" },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
  guestName: { type: String, trim: true, default: "" },
  guestCount: { type: Number, min: 1, default: 1 },
  startTime: { type: Date, required: true, default: Date.now },
  duration: { type: Number, required: true, min: 1 / 3600, max: 24 },
  rate: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },
  corkageFee: { type: Number, default: 0, min: 0 },
  hourlyRates: [{ type: Number, min: 0 }],
  paidAmount: { type: Number, default: 0, min: 0 },
  refundedAmount: { type: Number, default: 0, min: 0 },
  cancellationReason: { type: String, default: "", maxlength: 500 },
  paymentMethod: { type: String, default: "Cash", trim: true },
  paymentStatus: { type: String, enum: ["Paid", "Partial", "Unpaid"], default: "Unpaid" },
  paymentTiming: { type: String, enum: ["Before", "After"], default: "Before" },
  status: {
    type: String,
    enum: ["Active", "Finished", "Cancelled"],
    default: "Active",
  },
  endedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const RoomSession = mongoose.model("RoomSession", roomSessionSchema);

module.exports = { MonitorRoom, RoomSession };
