const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const Settings = require("../model/settings");
const BookingLock = require("../model/bookingLock");
const { LOCK_DURATION_MINUTES } = BookingLock;
const { requirePermission, ensureAuthenticated } = require("../middleware/adminAuth");
const { paymentProofUpload } = require("../middleware/upload");
const { PERMISSIONS, isAdminRole } = require("../utils/permissions");
const { validateAndPriceBooking, computeDownPayment, saveWithReservationCode, runInTransaction, voidExpiredBookings } = require("../utils/bookingHelper");


router.get("/", requirePermission(PERMISSIONS.BOOKING_VIEW), async (req, res) => {
  try {
    try {
      await voidExpiredBookings();
    } catch (e) {
      console.error("voidExpiredBookings failed:", e.message);
    }

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.room) filter.room = req.query.room;
    if (req.query.date) filter.date = req.query.date;
    if (req.query.guestContact) filter.guestContact = req.query.guestContact;
    else if (req.query.guestName) filter.guestName = req.query.guestName;
    if (req.query.search) {
      const safe = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safe, "i");
      filter.$or = [{ guestName: re }, { guestContact: re }, { reservationCode: re }];
    }

    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).populate("room", "name variants");
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/availability", async (req, res) => {
  try {
    const { roomId, date, variantLabel } = req.query;
    if (!roomId || !date) {
      return res.status(400).json({ message: "roomId and date are required." });
    }

    const filter = {
      room: roomId,
      date,
      status: { $nin: [Booking.BOOKING_STATUS.CANCELLED, Booking.BOOKING_STATUS.REJECTED] },
    };
    if (variantLabel) filter.variantLabel = variantLabel;

    const bookings = await Booking.find(filter).select("timeIn duration");

    const lockFilter = { room: roomId, date, expiresAt: { $gt: new Date() } };
    if (variantLabel) lockFilter.variantLabel = variantLabel;
    const locks = await BookingLock.find(lockFilter).select("timeIn duration");

    res.json([...bookings, ...locks].map(b => ({ timeIn: b.timeIn, duration: b.duration })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});


router.get("/availability-month", async (req, res) => {
  try {
    const { roomId, year, month, variantLabel } = req.query;
    if (!roomId || !year || !month) {
      return res.status(400).json({ message: "roomId, year and month are required." });
    }

    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ message: "Invalid year or month." });
    }

    const lastDay = new Date(y, m, 0).getDate();
    const startStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const endStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const filter = {
      room: roomId,
      date: { $gte: startStr, $lte: endStr },
      status: { $nin: [Booking.BOOKING_STATUS.CANCELLED, Booking.BOOKING_STATUS.REJECTED] },
    };

    if (variantLabel) filter.variantLabel = variantLabel;

    const bookings = await Booking.find(filter).select("date timeIn duration");

    const lockFilter = {
      room: roomId,
      date: { $gte: startStr, $lte: endStr },
      expiresAt: { $gt: new Date() },
    };
    if (variantLabel) lockFilter.variantLabel = variantLabel;
    if (req.session?.userId) lockFilter.lockedBy = { $ne: req.session.userId };
    const locks = await BookingLock.find(lockFilter).select("date timeIn duration");

    const byDate = {};
    [...bookings, ...locks].forEach((b) => {
      if (!byDate[b.date]) byDate[b.date] = [];
      byDate[b.date].push({ timeIn: b.timeIn, duration: b.duration });
    });

    res.json(byDate);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/lock", ensureAuthenticated, async (req, res) => {
  try {
    const { roomId, variantLabel, date, timeIn, duration: durationRaw } = req.body;
    const duration = Number(durationRaw);

    if (!roomId || !date || !timeIn || !duration) {
      return res.status(400).json({ message: "roomId, date, timeIn and duration are required." });
    }

    let lock;
    try {
      lock = await runInTransaction(async (session) => {
        const { room } = await validateAndPriceBooking({
          roomId,
          variantLabel,
          date,
          timeIn,
          duration,
          isAdminBooking: false,
          guestCount: undefined,
          excludeLockUserId: req.user._id,
          session,
        });

        await BookingLock.deleteMany({ lockedBy: req.user._id }).session(session);

        const expiresAt = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
        const [created] = await BookingLock.create(
          [{ room: room._id, variantLabel: variantLabel || null, date, timeIn, duration, lockedBy: req.user._id, expiresAt }],
          { session }
        );
        return created;
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    res.status(201).json({ id: lock._id, expiresAt: lock.expiresAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/lock/:id", ensureAuthenticated, async (req, res) => {
  try {
    const lock = await BookingLock.findOneAndDelete({ _id: req.params.id, lockedBy: req.user._id });
    if (!lock) return res.status(404).json({ message: "Lock not found." });
    res.json({ message: "Lock released." });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid lock id." });
  }
});

router.post("/", ensureAuthenticated, paymentProofUpload.single("paymentScreenshot"), async (req, res) => {
  try {
    const isAdminBooking = isAdminRole(req.user.role);
    if (!isAdminBooking) {
      return res.status(400).json({
        message: "Manual payment is no longer available. Please book and pay through the secure online checkout (POST /api/payments/paymongo/checkout).",
      });
    }

    const { guestName, guestContact, guestEmail, guestCount: guestCountRaw, specialRequests, roomId, variantLabel, date, timeIn, duration: durationRaw, paymentMethod } = req.body;
    const duration = Number(durationRaw);
    const guestCount = guestCountRaw !== undefined && guestCountRaw !== "" ? Number(guestCountRaw) : 1;

    if (!guestName) {
      return res.status(400).json({ message: "guestName, roomId, date, timeIn and duration are required." });
    }

    let booking;
    try {
      booking = await runInTransaction(async (session) => {
        const { room, amount } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount, session });

        const b = new Booking({
          guestName,
          guestContact: guestContact || "",
          guestEmail: guestEmail || "",
          guestCount: Number.isFinite(guestCount) && guestCount > 0 ? guestCount : 1,
          specialRequests: specialRequests || "",
          room: room._id,
          roomLabel: room.name,
          variantLabel: variantLabel || null,
          date,
          timeIn,
          duration,
          amount,
          ...(paymentMethod ? { paymentMethod } : {}),
          bookedBy: req.session.userId,
          source: "walk-in",
          status: req.body.status || Booking.BOOKING_STATUS.ONGOING,
          paymentStatus: "Paid",
        });

        await saveWithReservationCode(b, room.name, undefined, session);
        return b;
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/mine", ensureAuthenticated, async (req, res) => {
  try {
    const bookings = await Booking.find({ bookedBy: req.user._id }).sort({ createdAt: -1 }).populate("room", "name");
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("room", "name");
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    if (String(booking.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Not allowed." });
    }
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid booking id." });
  }
});

router.put("/:id/approve", requirePermission(PERMISSIONS.BOOKING_MANAGE), async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: Booking.BOOKING_STATUS.CONFIRMED, paymentStatus: Booking.PAYMENT_STATUS.PAID, reviewedBy: req.user._id, reviewedAt: new Date() },
      { returnDocument: "after", runValidators: true }
    );
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/:id/reject", requirePermission(PERMISSIONS.BOOKING_MANAGE), async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: Booking.BOOKING_STATUS.REJECTED, paymentStatus: Booking.PAYMENT_STATUS.REJECTED, reviewedBy: req.user._id, reviewedAt: new Date() },
      { returnDocument: "after", runValidators: true }
    );
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.BOOKING_MANAGE), async (req, res) => {
  try {
    const {
      status, duration, paymentMethod, timeIn, date, guestName,
      guestEmail, guestContact, guestCount, amount, downPayment,
      paymentStatus, specialRequests, room, variantLabel,
    } = req.body;

    let booking;
    try {
      booking = await runInTransaction(async (session) => {
        const existing = await Booking.findById(req.params.id).session(session);
        if (!existing) {
          throw { status: 404, message: "Booking not found." };
        }

        const update = {};
        if (status !== undefined) update.status = status;
        if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
        if (guestName !== undefined) update.guestName = guestName;
        if (guestEmail !== undefined) update.guestEmail = guestEmail;
        if (guestContact !== undefined) update.guestContact = guestContact;
        if (guestCount !== undefined) update.guestCount = guestCount;
        if (amount !== undefined) update.amount = amount;
        if (downPayment !== undefined) update.downPayment = downPayment;
        if (paymentStatus !== undefined) update.paymentStatus = paymentStatus;
        if (specialRequests !== undefined) update.specialRequests = specialRequests;

        const roomChanging = room !== undefined && String(room) !== String(existing.room);
        const variantChanging = variantLabel !== undefined && (variantLabel || null) !== (existing.variantLabel || null);
        const dateChanging = date !== undefined && date !== existing.date;
        const timeChanging = timeIn !== undefined && timeIn !== existing.timeIn;
        const durationChanging = duration !== undefined && Number(duration) !== existing.duration;

        if (roomChanging || variantChanging || dateChanging || timeChanging || durationChanging) {
          const effectiveRoomId = room !== undefined ? room : existing.room;
          const effectiveVariantLabel = variantLabel !== undefined ? variantLabel : existing.variantLabel;
          const effectiveDate = date !== undefined ? date : existing.date;
          const effectiveTimeIn = timeIn !== undefined ? timeIn : existing.timeIn;
          const effectiveDuration = duration !== undefined ? Number(duration) : existing.duration;

          const { room: validatedRoom } = await validateAndPriceBooking({
            roomId: effectiveRoomId,
            variantLabel: effectiveVariantLabel || undefined,
            date: effectiveDate,
            timeIn: effectiveTimeIn,
            duration: effectiveDuration,
            isAdminBooking: true,
            guestCount: undefined,
            excludeBookingId: existing._id,
            session,
          });

          update.room = validatedRoom._id;
          update.roomLabel = validatedRoom.name;
          update.variantLabel = effectiveVariantLabel || null;
          update.date = effectiveDate;
          update.timeIn = effectiveTimeIn;
          update.duration = effectiveDuration;
        }

        return Booking.findByIdAndUpdate(req.params.id, update, {
          returnDocument: "after", runValidators: true, session,
        });
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/:id", requirePermission(PERMISSIONS.BOOKING_MANAGE), async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json({ message: "Booking deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;