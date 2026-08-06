const express = require("express");
const { MonitorRoom, RoomSession } = require("../model/monitoring");
const Booking = require("../model/booking");
const { ensureAdmin, requirePermission, requireAnyPermission } = require("../middleware/adminAuth");
const { PERMISSIONS, hasPermission } = require("../utils/permissions");

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

const sessionsRouter = express.Router();

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

sessionsRouter.post("/", requireAnyPermission(PERMISSIONS.ROOM_MANAGE, PERMISSIONS.BOOKING_MANAGE), async (req, res) => {
  try {
    const { roomId, duration, paymentMethod, paymentStatus, guestName, bookingId, roomTarget } = req.body;

    if (!bookingId && !hasPermission(req.user, PERMISSIONS.ROOM_MANAGE)) {
      return res.status(403).json({ message: "You do not have permission to do that." });
    }

    if (!duration) {
      return res.status(400).json({ message: "duration is required." });
    }
    if (duration < 1 / 3600 || duration > 24) {
      return res.status(400).json({ message: "Duration must be at least 1 second and at most 24 hours." });
    }
    if (paymentStatus !== undefined && !["Paid", "Unpaid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }

    let room;
    if (roomId) {
      room = await MonitorRoom.findById(roomId);
      if (!room) return res.status(404).json({ message: "Room not found." });
    } else if (bookingId && roomTarget) {
      const { facilityName, roomName } = roomTarget;
      let { roomNumber } = roomTarget;
      if (!facilityName || !roomName) {
        return res.status(400).json({ message: "roomTarget requires facilityName and roomName." });
      }
      const parsedRoomNumber = parseInt(roomNumber, 10);
      const hasValidRoomNumber = !!roomNumber && !(Number.isFinite(parsedRoomNumber) && parsedRoomNumber <= 0);
      if (hasValidRoomNumber) {
        room = await MonitorRoom.findOne({ facilityName, roomNumber });
      }
      if (!room && !hasValidRoomNumber) {
        room = await MonitorRoom.findOne({ facilityName, roomName, status: "Available" });
      }
      if (!room) {
        if (!hasValidRoomNumber) {
          const existingRooms = await MonitorRoom.find({ facilityName }).select("roomNumber").lean();
          const usedNumbers = new Set(existingRooms.map((r) => parseInt(r.roomNumber, 10)).filter((n) => Number.isFinite(n) && n > 0));
          let nextNumber = 1;
          while (usedNumbers.has(nextNumber)) nextNumber++;
          roomNumber = String(nextNumber);
        }
        room = new MonitorRoom({ facilityName, roomName, roomNumber, price: 0, isTemporary: true });
        await room.save();
      }
    } else {
      return res.status(400).json({ message: "roomId, or bookingId with roomTarget, is required." });
    }

    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId);
      if (!booking) return res.status(404).json({ message: "Booking not found." });
      if (booking.status !== Booking.BOOKING_STATUS.CONFIRMED) {
        return res.status(400).json({ message: "This booking cannot be started (already started or not confirmed)." });
      }
    }

    const sessionDuration = booking ? booking.duration : duration;
    const rate = booking ? booking.amount / booking.duration : (room.price || 0);
    const amount = booking ? booking.amount : rate * duration;

    let paidAmount;
    let resolvedPaymentStatus;
    if (booking) {
      paidAmount = Math.min(Number(booking.downPayment) || 0, amount);
      resolvedPaymentStatus = paidAmount >= amount ? "Paid" : "Unpaid";
    } else {
      resolvedPaymentStatus = paymentStatus || "Unpaid";
      paidAmount = resolvedPaymentStatus === "Paid" ? amount : 0;
    }

    const session = new RoomSession({
      room: room._id,
      roomNumber: room.roomNumber,
      facilityName: room.facilityName,
      roomName: room.roomName,
      booking: booking ? booking._id : null,
      guestName: booking ? booking.guestName : (guestName ? String(guestName).trim() : ""),
      duration: sessionDuration,
      rate,
      amount,
      paidAmount,
      paymentMethod: paymentMethod || (booking ? booking.paymentMethod : "Cash"),
      paymentStatus: resolvedPaymentStatus,
      createdBy: req.user._id,
    });

    await session.save();

    if (booking) {
      booking.status = Booking.BOOKING_STATUS.ACTIVE;
      await booking.save();
    }

    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

sessionsRouter.put("/:id/extend", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { addedHours, paymentStatus, paymentMethod } = req.body;

    if (!addedHours || addedHours <= 0) {
      return res.status(400).json({ message: "addedHours must be greater than 0." });
    }
    if (paymentStatus !== undefined && !["Paid", "Unpaid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }

    const session = await RoomSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (session.status !== "Active") {
      return res.status(400).json({ message: "Only active sessions can be extended." });
    }

    if (!session.rate) {
      const room = await MonitorRoom.findById(session.room);
      session.rate = room?.price || 0;
      if (!session.amount) session.amount = session.rate * session.duration;
      if (session.paymentStatus === "Paid" && !session.paidAmount) session.paidAmount = session.amount;
    }

    const remainingHours = Math.max(0, (session.startTime.getTime() + session.duration * 3600000 - Date.now()) / 3600000);
    const newDuration = remainingHours + addedHours;
    if (newDuration > 24) {
      return res.status(400).json({ message: "Total remaining duration cannot exceed 24 hours." });
    }

    const addedAmount = session.rate * addedHours;
    const addedPaymentStatus = paymentStatus || "Unpaid";

    session.startTime = new Date();
    session.duration = newDuration;
    session.amount += addedAmount;
    if (addedPaymentStatus === "Paid") session.paidAmount += addedAmount;
    session.paymentStatus = session.paidAmount >= session.amount ? "Paid" : "Unpaid";
    if (paymentMethod !== undefined) session.paymentMethod = paymentMethod;

    await session.save();
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

sessionsRouter.put("/:id/end", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { paid } = req.body;

    const session = await RoomSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (session.status !== "Active") {
      return res.status(400).json({ message: "Only active sessions can be ended." });
    }

    const room = await MonitorRoom.findById(session.room);
    if (!session.rate) {
      session.rate = room?.price || 0;
      if (!session.amount) session.amount = session.rate * session.duration;
    }

    if (paid) {
      session.paidAmount = session.amount;
      session.paymentStatus = "Paid";
    } else {
      session.amount = 0;
      session.paidAmount = 0;
      session.paymentStatus = "Unpaid";
    }
    session.status = "Finished";
    session.endedAt = new Date();

    await session.save();

    let roomDeleted = false;
    if (room?.isTemporary) {
      await MonitorRoom.findByIdAndDelete(room._id);
      roomDeleted = true;
    }

    res.json({ ...session.toObject(), roomDeleted });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

sessionsRouter.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { amount, paidAmount, paymentStatus, guestName } = req.body;

    if (paymentStatus !== undefined && !["Paid", "Unpaid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }
    if (amount !== undefined && amount < 0) {
      return res.status(400).json({ message: "Amount cannot be negative." });
    }
    if (paidAmount !== undefined && paidAmount < 0) {
      return res.status(400).json({ message: "Paid amount cannot be negative." });
    }

    const session = await RoomSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (session.status !== "Finished") {
      return res.status(400).json({ message: "Only finished sessions can be corrected." });
    }

    if (amount !== undefined) session.amount = amount;
    if (paidAmount !== undefined) session.paidAmount = paidAmount;
    if (guestName !== undefined) session.guestName = String(guestName).trim();
    if (paymentStatus !== undefined) {
      session.paymentStatus = paymentStatus;
      session.paidAmount = paymentStatus === "Paid" ? session.amount : 0;
    }

    await session.save();
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

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