const express = require("express");
const { MonitorRoom, RoomSession } = require("../model/monitoring");
const Booking = require("../model/booking");
const { ensureAdmin, requirePermission, requireAnyPermission } = require("../middleware/adminAuth");
const { PERMISSIONS, hasPermission } = require("../utils/permissions");
const { bookingCollected, financialFields, extendSessionFields, endSessionFields } = require("../utils/bookingLifecycle");
const { calculateBookingPrice, parsePaxCapacity } = require("../utils/roomPricing");
const { TIME_ZONE } = require("../utils/constants");
const { getMonitorReport } = require("../utils/monitorReport");
const { createWorkbook, addSummarySheet, addActivitySheet, addRoomTypeSheet } = require("../utils/reportWorkbook");
const { validate } = require("../middleware/validate");
const {
  idParamsSchema,
  emptyBodySchema,
  monitorRoomCreateSchema,
  monitorRoomUpdateSchema,
  sessionCreateSchema,
  sessionExtendSchema,
  sessionEndSchema,
  sessionCorrectionSchema,
  sessionCancelSchema,
} = require("../validation/monitoringSchemas");

function currentBusinessHour(value = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date(value)));
}

async function syncBookingFromSession(session, status) {
  if (!session.booking) return;
  await Booking.findByIdAndUpdate(session.booking, {
    status,
    duration: session.duration,
    amount: session.amount,
    roomCharge: Math.max(0, Number(session.amount || 0) - Number(session.corkageFee || 0)),
    corkageFee: Number(session.corkageFee) || 0,
    hourlyRates: session.hourlyRates || [],
    paidAmount: Number(session.paidAmount) || 0,
    refundedAmount: Number(session.refundedAmount) || 0,
    paymentStatus: session.paymentStatus,
    paymentMethod: session.paymentMethod || "Cash",
    paymentUpdatedAt: new Date(),
  }, { runValidators: true });
}

const roomsRouter = express.Router();

roomsRouter.get("/", ensureAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    const rooms = await MonitorRoom.find(filter).sort({ facilityName: 1, roomNumber: 1 });
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

roomsRouter.get("/:id", ensureAdmin, validate(idParamsSchema, "params"), async (req, res) => {
  try {
    const room = await MonitorRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found." });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid room id." });
  }
});

roomsRouter.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), validate(monitorRoomCreateSchema), async (req, res) => {
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

roomsRouter.put("/:id", requireAnyPermission(PERMISSIONS.ROOM_MANAGE, PERMISSIONS.ROOM_OPERATE), validate(idParamsSchema, "params"), validate(monitorRoomUpdateSchema), async (req, res) => {
  try {
    const { facilityName, roomName, roomNumber, price, status } = req.body;
    if (!hasPermission(req.user, PERMISSIONS.ROOM_MANAGE) && Object.keys(req.body || {}).some((key) => key !== "status")) {
      return res.status(403).json({ message: "Only room status can be changed by an operator." });
    }

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

roomsRouter.delete("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), validate(idParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
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

sessionsRouter.get("/report", ensureAdmin, async (req, res) => {
  try {
    res.json(await getMonitorReport({ from: req.query.from, to: req.query.to }));
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.status === 400 ? err.message : "Could not load the session report." });
  }
});

sessionsRouter.get("/report/export", ensureAdmin, async (req, res) => {
  try {
    const report = await getMonitorReport({ from: req.query.from, to: req.query.to });
    const workbook = createWorkbook();
    addSummarySheet(workbook, {
      title: "The Riverview — Live monitor report",
      range: report.range,
      metrics: [
        { label: "Sessions", value: report.summary.sessions },
        { label: "Occupied hours", value: report.summary.hours, format: "hours" },
        { label: "Charges", value: report.summary.charged, format: "money" },
        { label: "Collected", value: report.summary.collected, format: "money" },
        { label: "Outstanding balance", value: report.summary.outstanding, format: "money" },
        { label: "Paid / partial / unpaid", value: `${report.summary.paid} / ${report.summary.partial} / ${report.summary.unpaid}` },
      ],
      notes: ["Each row is one played session. Charges are calculated from the exact facility and room type for each whole hour."],
    });
    addActivitySheet(workbook, report.rows, { name: "Played sessions" });
    addRoomTypeSheet(workbook, report.byRoomType);
    const filename = `Riverview-Live-Monitor_${report.range.from}_to_${report.range.to}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(err.status || 500).json({ message: err.status === 400 ? err.message : "Could not generate the live monitor report." });
  }
});

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

sessionsRouter.post("/", requireAnyPermission(PERMISSIONS.ROOM_OPERATE, PERMISSIONS.BOOKING_MANAGE), validate(sessionCreateSchema), async (req, res) => {
  try {
    const { roomId, duration, paymentMethod, paymentStatus, paidAmount: requestedPaidAmount, paymentTiming, guestName, guestCount: requestedGuestCount, hasCorkage, bookingId, roomTarget } = req.body;

    if (!bookingId && !hasPermission(req.user, PERMISSIONS.ROOM_OPERATE)) {
      return res.status(403).json({ message: "You do not have permission to do that." });
    }

    if (!duration) {
      return res.status(400).json({ message: "duration is required." });
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 24) {
      return res.status(400).json({ message: "Duration must be from 1 to 24 whole hours." });
    }
    if (paymentStatus !== undefined && !["Paid", "Partial", "Unpaid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }
    if (paymentTiming !== undefined && !["Before", "After"].includes(paymentTiming)) {
      return res.status(400).json({ message: "Invalid payment timing." });
    }

    let room;
    if (roomId) {
      room = await MonitorRoom.findById(roomId);
      if (!room) return res.status(404).json({ message: "Room not found." });
    } else if (bookingId && roomTarget) {
      const { facilityName, roomName } = roomTarget;
      if (!facilityName || !roomName) {
        return res.status(400).json({ message: "roomTarget requires facilityName and roomName." });
      }
      const startingRoomNumber = parseInt(roomTarget.startingRoomNumber, 10);
      const roomCount = parseInt(roomTarget.roomCount, 10);
      const hasValidRange = Number.isFinite(startingRoomNumber) && startingRoomNumber > 0 && Number.isFinite(roomCount) && roomCount > 0;

      if (hasValidRange) {
        const rangeEnd = startingRoomNumber + roomCount - 1;
        const facilityRooms = await MonitorRoom.find({ facilityName, roomName });
        const inRange = facilityRooms
          .map((r) => ({ doc: r, num: parseInt(r.roomNumber, 10) }))
          .filter((r) => Number.isFinite(r.num) && r.num >= startingRoomNumber && r.num <= rangeEnd)
          .sort((a, b) => a.num - b.num);

        const availableInRange = inRange.find((r) => r.doc.status === "Available");
        if (availableInRange) {
          room = availableInRange.doc;
        } else {
          const usedInRange = new Set(inRange.map((r) => r.num));
          let nextInRange = startingRoomNumber;
          while (nextInRange <= rangeEnd && usedInRange.has(nextInRange)) nextInRange++;
          let targetNumber;
          if (nextInRange <= rangeEnd) {
            targetNumber = nextInRange;
          } else {
            const usedAll = new Set(facilityRooms.map((r) => parseInt(r.roomNumber, 10)).filter((n) => Number.isFinite(n) && n > 0));
            targetNumber = rangeEnd + 1;
            while (usedAll.has(targetNumber)) targetNumber++;
          }
          room = new MonitorRoom({ facilityName, roomName, roomNumber: String(targetNumber), price: 0, isTemporary: true });
          await room.save();
        }
      } else {
        let { roomNumber } = roomTarget;
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
    const guestCount = booking ? booking.guestCount : Math.max(1, Number(requestedGuestCount) || 1);
    const roomCapacity = parsePaxCapacity(room.pax);
    if (!booking && roomCapacity && guestCount > roomCapacity) {
      return res.status(400).json({ message: `This room accommodates up to ${roomCapacity} guest(s).` });
    }
    const directPricing = booking ? null : calculateBookingPrice({
      variant: room,
      timeIn: `${String(currentBusinessHour()).padStart(2, "0")}:00`,
      duration,
      guestCount,
      hasCorkage: !!hasCorkage,
    });
    const rate = booking ? (booking.hourlyRates?.[0] || booking.amount / booking.duration) : directPricing.unitPrice;
    const amount = booking ? booking.amount : directPricing.amount;

    let paidAmount;
    let resolvedPaymentStatus;
    if (booking) {
      const alreadyReceived = bookingCollected(booking);
      paidAmount = requestedPaidAmount === undefined ? alreadyReceived : Number(requestedPaidAmount);
      if (!Number.isFinite(paidAmount) || paidAmount < alreadyReceived) return res.status(400).json({ message: "Received payments cannot be reduced when starting a reservation." });
      if (paidAmount > amount) return res.status(400).json({ message: "Received payment cannot exceed the session charge." });
      resolvedPaymentStatus = financialFields(amount, paidAmount, booking.refundedAmount || 0).paymentStatus;
    } else {
      resolvedPaymentStatus = paymentStatus || "Unpaid";
      paidAmount = Number(requestedPaidAmount) || (resolvedPaymentStatus === "Paid" ? amount : 0);
      if (paidAmount > amount) return res.status(400).json({ message: "Received payment cannot exceed the session charge." });
      resolvedPaymentStatus = financialFields(amount, paidAmount, 0).paymentStatus;
    }

    if (await RoomSession.exists({ room: room._id, status: "Active" })) return res.status(409).json({ message: "This room already has an active session." });
    const claimedRoom = await MonitorRoom.findOneAndUpdate(
      { _id: room._id, status: "Available" },
      { $set: { status: "Occupied" } },
      { returnDocument: "after" }
    );
    if (!claimedRoom) return res.status(409).json({ message: "This room is no longer available." });

    const session = new RoomSession({
      room: room._id,
      roomNumber: claimedRoom.roomNumber,
      facilityName: claimedRoom.facilityName,
      roomName: claimedRoom.roomName,
      booking: booking ? booking._id : null,
      guestName: booking ? booking.guestName : (guestName ? String(guestName).trim() : ""),
      guestCount,
      duration: sessionDuration,
      rate,
      amount,
      corkageFee: booking ? Number(booking.corkageFee) || 0 : directPricing.corkageFee,
      hourlyRates: booking ? booking.hourlyRates || [] : directPricing.hourlyRates,
      paidAmount,
      refundedAmount: booking ? Number(booking.refundedAmount) || 0 : 0,
      paymentMethod: paymentMethod || (booking ? booking.paymentMethod : "Cash"),
      paymentStatus: resolvedPaymentStatus,
      paymentTiming: paymentTiming || (resolvedPaymentStatus === "Paid" ? "Before" : "After"),
      createdBy: req.user._id,
    });

    try {
      await session.save();
    } catch (err) {
      await MonitorRoom.updateOne({ _id: claimedRoom._id, status: "Occupied" }, { $set: { status: "Available" } });
      throw err;
    }

    if (booking) {
      booking.status = Booking.BOOKING_STATUS.ONGOING;
      booking.paidAmount = paidAmount;
      booking.paymentStatus = resolvedPaymentStatus;
      booking.paymentUpdatedAt = new Date();
      if (paymentMethod) booking.paymentMethod = paymentMethod;
      await booking.save();
    }

    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

sessionsRouter.put("/:id/extend", requirePermission(PERMISSIONS.ROOM_OPERATE), validate(idParamsSchema, "params"), validate(sessionExtendSchema), async (req, res) => {
  try {
    const { addedHours, paymentStatus, paymentMethod } = req.body;

    if (!addedHours || addedHours <= 0) {
      return res.status(400).json({ message: "addedHours must be greater than 0." });
    }
    if (paymentStatus !== undefined && !["Paid", "Partial", "Unpaid"].includes(paymentStatus)) {
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

    const newDuration = Number(session.duration) + Number(addedHours);
    if (newDuration > 24) {
      return res.status(400).json({ message: "Total session duration cannot exceed 24 hours." });
    }

    const room = await MonitorRoom.findById(session.room);
    const pricing = calculateBookingPrice({
      variant: room || { price: session.rate },
      timeIn: `${String(currentBusinessHour(session.startTime)).padStart(2, "0")}:00`,
      duration: newDuration,
      guestCount: session.guestCount,
      hasCorkage: Number(session.corkageFee) > 0,
    });
    const fields = extendSessionFields(session, addedHours, pricing.amount);
    session.duration = fields.duration;
    session.amount = fields.amount;
    session.rate = pricing.unitPrice;
    session.hourlyRates = pricing.hourlyRates;
    session.corkageFee = pricing.corkageFee;
    session.paidAmount = fields.paidAmount;
    session.refundedAmount = fields.refundedAmount;
    session.paymentStatus = fields.paymentStatus;
    if (paymentStatus === "Paid") {
      session.paidAmount = fields.amount;
      session.paymentStatus = "Paid";
    }
    if (paymentMethod !== undefined) session.paymentMethod = paymentMethod;

    await session.save();
    await syncBookingFromSession(session, Booking.BOOKING_STATUS.ONGOING);
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

sessionsRouter.put("/:id/end", requirePermission(PERMISSIONS.ROOM_OPERATE), validate(idParamsSchema, "params"), validate(sessionEndSchema), async (req, res) => {
  try {
    const { paid, paidAmount } = req.body;

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

    const fields = endSessionFields(session, { paid: !!paid, paidAmount });
    Object.assign(session, fields);

    await session.save();

    await MonitorRoom.updateOne({ _id: session.room, status: "Occupied" }, { $set: { status: "Available" } });
    await syncBookingFromSession(session, Booking.BOOKING_STATUS.DONE);

    let roomDeleted = false;
    // Temporary rooms remain as history anchors; inventory cleanup is explicit.

    res.json({ ...session.toObject(), roomDeleted });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

sessionsRouter.put("/:id", requirePermission(PERMISSIONS.ROOM_OPERATE), validate(idParamsSchema, "params"), validate(sessionCorrectionSchema), async (req, res) => {
  try {
    const { amount, paidAmount, paymentStatus, paymentTiming, guestName } = req.body;

    if (paymentStatus !== undefined && !["Paid", "Partial", "Unpaid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status." });
    }
    if (paymentTiming !== undefined && !["Before", "After"].includes(paymentTiming)) {
      return res.status(400).json({ message: "Invalid payment timing." });
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
    if (paymentTiming !== undefined) session.paymentTiming = paymentTiming;
    if (paymentStatus !== undefined && paidAmount === undefined && paymentStatus !== session.paymentStatus) return res.status(400).json({ message: "Record the actual amount received to change payment status." });
    if (paidAmount !== undefined) session.paidAmount = paidAmount;
    session.paymentStatus = financialFields(session.amount, session.paidAmount || 0, session.refundedAmount || 0).paymentStatus;

    await session.save();
    await syncBookingFromSession(session, Booking.BOOKING_STATUS.DONE);
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

sessionsRouter.delete("/:id", requirePermission(PERMISSIONS.ROOM_OPERATE), validate(idParamsSchema, "params"), validate(sessionCancelSchema), async (req, res) => {
  try {
    const session = await RoomSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found." });
    if (session.status !== "Active") return res.status(409).json({ message: "Only an active session can be cancelled." });
    session.status = "Cancelled";
    session.endedAt = new Date();
    session.cancellationReason = String(req.body?.reason || "Session cancelled by staff").slice(0, 500);
    await session.save();
    await MonitorRoom.updateOne({ _id: session.room, status: "Occupied" }, { $set: { status: "Available" } });
    if (session.booking) await Booking.findByIdAndUpdate(session.booking, { status: Booking.BOOKING_STATUS.CONFIRMED });
    res.json({ message: "Session cancelled.", session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = { roomsRouter, sessionsRouter };
