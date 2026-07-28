const express = require("express");
const { MonitorRoom, RoomSession } = require("../model/monitoring");
const { ensureAdmin, requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");
  
const roomsRouter = express.Router();

roomsRouter.get("/", ensureAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const rooms = await MonitorRoom.find(filter).sort({ facilityName: 1, roomNumber: 1 });
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

roomsRouter.get("/:id", ensureAdmin, async (req, res) => {
  try {
    const room = await MonitorRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found." });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid room id." });
  }
});

roomsRouter.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { facilityName, roomName, roomNumber, price, status } = req.body;

    if (!facilityName || !roomName || !roomNumber) {
      return res.status(400).json({ message: "facilityName, roomName, and roomNumber are required." });
    }

    const room = new MonitorRoom({
      facilityName,
      roomName,
      roomNumber,
      price: Number(price) || 0,
      status: status || "Available",
    });

    await room.save();
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

roomsRouter.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { facilityName, roomName, roomNumber, price, status } = req.body;

    const update = {};
    if (facilityName !== undefined) update.facilityName = facilityName;
    if (roomName !== undefined) update.roomName = roomName;
    if (roomNumber !== undefined) update.roomNumber = roomNumber;
    if (price !== undefined) update.price = Number(price) || 0;
    if (status !== undefined) update.status = status;

    const room = await MonitorRoom.findByIdAndUpdate(req.params.id, update, { returnDocument: "after", runValidators: true });
    if (!room) return res.status(404).json({ message: "Room not found." });

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

roomsRouter.delete("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const room = await MonitorRoom.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found." });
    res.json({ message: "Room deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Sessions ────────────────────────────────────────────────────────────
const sessionsRouter = express.Router();

// GET / — all sessions (Active + Finished), newest first. Monitor.jsx derives
// current occupancy and each room's last finished session from this one list.
sessionsRouter.get("/", ensureAdmin, async (req, res) => {
  try {
    const sessions = await RoomSession.find()
      .populate("room", "facilityName roomName roomNumber status")
      .sort({ startTime: -1 });
    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// POST / — starts a new session on a room (Available room's "Edit" button).
sessionsRouter.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { roomId, duration, paymentMethod, paymentStatus } = req.body;

    if (!roomId || !duration) {
      return res.status(400).json({ message: "roomId and duration are required." });
    }
    if (duration < 1 / 3600 || duration > 24) {
      return res.status(400).json({ message: "Duration must be at least 1 second and at most 24 hours." });
    }
    if (paymentStatus !== undefined && !["Paid", "Unpaid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }

    const room = await MonitorRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found." });

    const session = new RoomSession({
      room: room._id,
      roomNumber: room.roomNumber,
      duration,
      paymentMethod: paymentMethod || "Cash",
      paymentStatus: paymentStatus || "Unpaid",
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
sessionsRouter.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { duration, paymentMethod, paymentStatus, startTime, status } = req.body;

    if (duration !== undefined && (duration < 1 / 3600 || duration > 24)) {
      return res.status(400).json({ message: "Duration must be at least 1 second and at most 24 hours." });
    }
    if (status !== undefined && !["Active", "Finished"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }
    if (paymentStatus !== undefined && !["Paid", "Unpaid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }

    const update = {};
    if (duration !== undefined) update.duration = duration;
    if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
    if (paymentStatus !== undefined) update.paymentStatus = paymentStatus;
    if (startTime !== undefined) update.startTime = startTime;
    if (status !== undefined) update.status = status;

    const session = await RoomSession.findByIdAndUpdate(req.params.id, update, { returnDocument: "after", runValidators: true });
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
sessionsRouter.delete("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const session = await RoomSession.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found." });
    res.json({ message: "Session record deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = { roomsRouter, sessionsRouter };