const mongoose = require("mongoose");

const monitorRoomSchema = new mongoose.Schema({
  facilityName: { type: String, required: true, trim: true },
  roomName:     { type: String, required: true, trim: true },
  roomNumber:   { type: String, required: true, trim: true },
  price:        { type: Number, default: 0, min: 0 },
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
  startTime: { type: Date, required: true, default: Date.now },
  duration: { type: Number, required: true, min: 1 / 3600, max: 24 },
  rate: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  paymentMethod: { type: String, default: "Cash", trim: true },
  paymentStatus: { type: String, enum: ["Paid", "Unpaid"], default: "Unpaid" },
  status: {
    type: String,
    enum: ["Active", "Finished"],
    default: "Active",
  },
  endedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const RoomSession = mongoose.model("RoomSession", roomSessionSchema);

module.exports = { MonitorRoom, RoomSession };