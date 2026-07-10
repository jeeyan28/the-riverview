const mongoose = require("mongoose");

// Room Monitoring's own independent collection (FEATURE_REQUESTS.md Priority 1,
// item 1 — no connection to Booking). Tracks a single manually-started
// occupancy on a Room: who started it, which room, when, for how long, how
// they paid, and whether it's still running.
//
// NOTE: this file previously contained a duplicate copy of the Express router
// (routes/roomSessionRoutes.js) instead of this schema, which meant
// `require("../model/roomSession")` resolved to a router, not a model, and
// every RoomSession.find()/save()/findByIdAndUpdate() call in the routes file
// would have thrown at runtime. Rebuilt here from the fields the routes file
// already assumes exist.
const roomSessionSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  // Denormalized snapshot of the room's number at session start (and
  // re-snapshotted on move, if the roomId-move version of PUT /:id is in
  // use) — same pattern as Room.categoryName, so this still reads correctly
  // even if the Room document changes later.
  roomNumber: { type: String, required: true, trim: true },
  startTime: { type: Date, required: true, default: Date.now },
  // Hours; validated in roomSessionRoutes.js to be >= 1 second and <= 24h.
  duration: { type: Number, required: true, min: 1 / 3600, max: 24 },
  paymentMethod: { type: String, default: "Cash", trim: true },
  status: {
    type: String,
    enum: ["Active", "Finished"],
    default: "Active",
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("RoomSession", roomSessionSchema);