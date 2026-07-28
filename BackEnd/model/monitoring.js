const mongoose = require("mongoose");

const monitorRoomSchema = new mongoose.Schema({
  facilityName: { type: String, required: true, trim: true }, // e.g. Billiards, Karaoke
  roomName:     { type: String, required: true, trim: true }, // room's own name within the facility
  roomNumber:   { type: String, required: true, trim: true },
  price:        { type: Number, default: 0, min: 0 },
  status:       { type: String, enum: ["Available", "Occupied", "Under Maintenance", "Inactive"], default: "Available" },
  createdAt:    { type: Date, default: Date.now },
});

const MonitorRoom = mongoose.model("MonitorRoom", monitorRoomSchema);

// Tracks a single manually-started occupancy on a MonitorRoom: who started
// it, which room, when, for how long, how they paid, and whether it's
// still running.
const roomSessionSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "MonitorRoom", required: true },
  // Denormalized snapshot of the room's number at session start — same
  // pattern as Room.categoryName, so this still reads correctly even if
  // the MonitorRoom document changes later.
  roomNumber: { type: String, required: true, trim: true },
  startTime: { type: Date, required: true, default: Date.now },
  // Hours; validated in the routes below to be >= 1 second and <= 24h.
  duration: { type: Number, required: true, min: 1 / 3600, max: 24 },
  paymentMethod: { type: String, default: "Cash", trim: true },
  // Staff sets this explicitly when starting or extending a session — not
  // inferred from paymentMethod, since choosing GCash/Maya doesn't mean
  // payment was actually collected.
  paymentStatus: { type: String, enum: ["Paid", "Unpaid"], default: "Unpaid" },
  status: {
    type: String,
    enum: ["Active", "Finished"],
    default: "Active",
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const RoomSession = mongoose.model("RoomSession", roomSessionSchema);

module.exports = { MonitorRoom, RoomSession };