const express = require("express");
const router = express.Router();
const RoomSession = require("../model/roomSession");
const Room = require("../model/room");
const { ensureAdmin, requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

// Room Monitoring's own independent endpoint (FEATURE_REQUESTS.md Priority 1)
// — no relation to Booking. Any logged-in admin/staff can view the monitor;
// only room:manage can start/extend/end/delete a session.

// GET / — all sessions (Active + Finished), newest first. Monitor.jsx derives
// current occupancy and each room's last finished session from this one list.
router.get("/", ensureAdmin, async (req, res) => {
  try {
    const sessions = await RoomSession.find()
      .populate("room", "name roomNumber status")
      .sort({ startTime: -1 });
    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// POST / — starts a new session on a room (Available room's "Edit" button).
router.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { roomId, duration, paymentMethod } = req.body;

    if (!roomId || !duration) {
      return res.status(400).json({ message: "roomId and duration are required." });
    }
    if (duration < 1 / 3600 || duration > 24) {
      return res.status(400).json({ message: "Duration must be at least 1 second and at most 24 hours." });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found." });

    const session = new RoomSession({
      room: room._id,
      roomNumber: room.roomNumber,
      duration,
      paymentMethod: paymentMethod || "Cash",
      createdBy: req.user._id,
    });

    await session.save();
    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

// PUT /:id — covers Extend and End Session (status: 'Finished'). Only the
// fields Monitor.jsx actually sends are accepted.
router.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { duration, paymentMethod, startTime, status } = req.body;

    if (duration !== undefined && (duration < 1 / 3600 || duration > 24)) {
      return res.status(400).json({ message: "Duration must be at least 1 second and at most 24 hours." });
    }
    if (status !== undefined && !["Active", "Finished"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const update = {};
    if (duration !== undefined) update.duration = duration;
    if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
    if (startTime !== undefined) update.startTime = startTime;
    if (status !== undefined) update.status = status;

    const session = await RoomSession.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!session) return res.status(404).json({ message: "Session not found." });

    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

// DELETE /:id — permanently deletes a kept (Finished) session record.
// Not currently called from Monitor.jsx (Edit Last Session/Delete record UI
// was removed), kept as a valid API endpoint.
router.delete("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const session = await RoomSession.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found." });
    res.json({ message: "Session record deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;