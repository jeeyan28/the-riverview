const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const Settings = require("../model/settings");
const BookingLock = require("../model/bookingLock");
const { RoomSession } = require("../model/monitoring");
const { bookingCollected, financialFields, reviewCancellationFields } = require("../utils/bookingLifecycle");
const { LOCK_DURATION_MINUTES } = BookingLock;
const { requirePermission, ensureAuthenticated } = require("../middleware/adminAuth");
const { paymentProofUpload } = require("../middleware/upload");
const { PERMISSIONS, isAdminRole } = require("../utils/permissions");
const { validateAndPriceBooking, computeDownPayment, saveWithReservationCode, runInTransaction, voidExpiredBookings, updateBookingLifecycleStatuses, bookingStartMs } = require("../utils/bookingHelper");
const { validate } = require("../middleware/validate");
const {
  bookingIdParamsSchema,
  emptyBodySchema,
  lockSchema,
  createBookingSchema,
  rescheduleSchema,
  updateBookingSchema,
  cancellationRequestSchema,
  cancellationReviewSchema,
} = require("../validation/bookingSchemas");
const { logAudit } = require("../utils/auditLog");
const { bookingActionLimiter } = require("../middleware/rateLimiter");

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

router.get("/", requirePermission(PERMISSIONS.BOOKING_VIEW), async (req, res) => {
  try {
    try {
      await voidExpiredBookings();
    } catch (e) {
      console.error("voidExpiredBookings failed:", e.message);
    }
    try {
      await updateBookingLifecycleStatuses();
    } catch (e) {
      console.error("updateBookingLifecycleStatuses failed:", e.message);
    }

    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.paymentStatus) filter.paymentStatus = String(req.query.paymentStatus);
    if (req.query.cancellationStatus) filter.cancellationStatus = String(req.query.cancellationStatus);
    if (req.query.room) filter.room = String(req.query.room);
    const exactDate = req.query.date ? String(req.query.date) : "";
    const fromDate = req.query.from ? String(req.query.from) : "";
    const toDate = req.query.to ? String(req.query.to) : "";
    if ([exactDate, fromDate, toDate].some((value) => value && !DATE_KEY_PATTERN.test(value))) {
      return res.status(400).json({ message: "Dates must use YYYY-MM-DD format." });
    }
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ message: "The start date cannot be after the end date." });
    }
    if (exactDate) filter.date = exactDate;
    else if (fromDate || toDate) {
      filter.date = {
        ...(fromDate ? { $gte: fromDate } : {}),
        ...(toDate ? { $lte: toDate } : {}),
      };
    }
    if (req.query.guestContact) filter.guestContact = String(req.query.guestContact);
    else if (req.query.guestName) filter.guestName = String(req.query.guestName);
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      status: { $nin: [Booking.BOOKING_STATUS.CANCELLED, Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.NO_SHOW] },
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
      status: { $nin: [Booking.BOOKING_STATUS.CANCELLED, Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.NO_SHOW] },
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

router.post("/lock", ensureAuthenticated, bookingActionLimiter, validate(lockSchema), async (req, res) => {
  try {
    const { roomId, variantLabel, date, timeIn, duration } = req.body;

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

router.delete("/lock/:id", ensureAuthenticated, validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const lock = await BookingLock.findOneAndDelete({ _id: req.params.id, lockedBy: req.user._id });
    if (!lock) return res.status(404).json({ message: "Lock not found." });
    res.json({ message: "Lock released." });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid lock id." });
  }
});

router.post("/", requirePermission(PERMISSIONS.BOOKING_MANAGE), paymentProofUpload.single("paymentScreenshot"), validate(createBookingSchema), async (req, res) => {
  try {
    const isAdminBooking = isAdminRole(req.user.role);
    if (!isAdminBooking) {
      return res.status(400).json({
        message: "Manual payment is no longer available. Please book and pay through the secure online checkout (POST /api/payments/paymongo/checkout).",
      });
    }

    const { guestName, guestContact, guestEmail, guestCount, hasCorkage, specialRequests, roomId, variantLabel, date, timeIn, duration, paymentMethod } = req.body;

    let booking;
    try {
      booking = await runInTransaction(async (session) => {
        const { room, amount, roomCharge, corkageFee, hourlyRates } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount, hasCorkage, session });
        if (Number(req.body.paidAmount || 0) > amount) {
          throw { status: 400, message: "Amount received cannot exceed the reservation charge." };
        }

        const b = new Booking({
          guestName,
          guestContact: guestContact || "",
          guestEmail: guestEmail || "",
          guestCount: guestCount || 1,
          specialRequests: specialRequests || "",
          room: room._id,
          roomLabel: room.name,
          variantLabel: variantLabel || null,
          date,
          timeIn,
          duration,
          amount,
          roomCharge,
          hourlyRates,
          corkageFee,
          ...(paymentMethod ? { paymentMethod } : {}),
          bookedBy: req.session.userId,
          source: "walk-in",
          status: req.body.status || Booking.BOOKING_STATUS.PENDING,
          ...financialFields(amount, req.body.paidAmount || 0),
          paymentUpdatedAt: req.body.paidAmount ? new Date() : undefined,
        });

        await saveWithReservationCode(b, room.name, undefined, session);
        return b;
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    await logAudit({ category: "Booking", action: "created", description: `created walk-in booking ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/mine", ensureAuthenticated, async (req, res) => {
  try {
    await voidExpiredBookings();
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

router.put("/:id/reschedule", ensureAuthenticated, bookingActionLimiter, validate(bookingIdParamsSchema, "params"), validate(rescheduleSchema), async (req, res) => {
  try {
    const { date, timeIn } = req.body;

    let booking;
    try {
      booking = await runInTransaction(async (session) => {
        const existing = await Booking.findById(req.params.id).session(session);
        if (!existing) throw { status: 404, message: "Booking not found." };
        if (String(existing.bookedBy) !== String(req.user._id)) {
          throw { status: 403, message: "Not allowed." };
        }
        if (existing.status !== Booking.BOOKING_STATUS.CONFIRMED) {
          throw { status: 409, message: "Only confirmed bookings can be rescheduled." };
        }
        if (existing.cancellationStatus === "Requested") throw { status: 409, message: "Wait for the cancellation review before rescheduling." };
        if (existing.rescheduleCount >= Booking.MAX_RESCHEDULES) {
          throw { status: 409, message: "This booking has already been rescheduled the maximum number of times." };
        }
        if (bookingStartMs(existing.date, existing.timeIn) - Date.now() < Booking.RESCHEDULE_CUTOFF_HOURS * 3600000) {
          throw { status: 409, message: `Reschedule is no longer available within ${Booking.RESCHEDULE_CUTOFF_HOURS} hours of your reservation.` };
        }

        const pricing = await validateAndPriceBooking({
          roomId: existing.room,
          variantLabel: existing.variantLabel || undefined,
          date,
          timeIn,
          duration: existing.duration,
          isAdminBooking: false,
          guestCount: existing.guestCount,
          hasCorkage: Number(existing.corkageFee) > 0,
          excludeBookingId: existing._id,
          session,
        });

        const financial = financialFields(pricing.amount, bookingCollected(existing), existing.refundedAmount || 0);
        return Booking.findByIdAndUpdate(
          req.params.id,
          {
            $set: {
              date,
              timeIn,
              amount: pricing.amount,
              roomCharge: pricing.roomCharge,
              hourlyRates: pricing.hourlyRates,
              corkageFee: pricing.corkageFee,
              ...financial,
            },
            $inc: { rescheduleCount: 1 },
          },
          { returnDocument: "after", runValidators: true, session }
        );
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

router.put("/:id/cancellation-request", ensureAuthenticated, bookingActionLimiter, validate(bookingIdParamsSchema, "params"), validate(cancellationRequestSchema), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (String(booking.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) return res.status(403).json({ message: "Not allowed." });
    if (booking.status !== Booking.BOOKING_STATUS.CONFIRMED) return res.status(409).json({ message: "Only confirmed reservations can be cancelled." });
    if (booking.cancellationStatus === "Requested") return res.status(409).json({ message: "A cancellation request is already waiting for review." });
    booking.cancellationStatus = "Requested";
    booking.cancellationRequestedAt = new Date();
    booking.cancellationReason = req.body.reason;
    await booking.save();
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Could not request cancellation." });
  }
});

router.put("/:id/cancellation-review", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(cancellationReviewSchema), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.cancellationStatus !== "Requested") return res.status(409).json({ message: "There is no pending cancellation request for this reservation." });
    const fields = reviewCancellationFields(booking, { decision: req.body.decision, refundedAmount: req.body.refundedAmount, note: req.body.note }, req.user._id);
    Object.assign(booking, fields);
    await booking.save();
    await logAudit({ category: "Booking", action: "updated", description: `${req.body.decision}d cancellation for ${booking.reservationCode}`, user: req.user });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Could not review cancellation." });
  }
});

router.put("/:id/approve", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["Pending", "Pending Payment Verification"] } },
      { status: Booking.BOOKING_STATUS.CONFIRMED, reviewedBy: req.user._id, reviewedAt: new Date() },
      { returnDocument: "after", runValidators: true }
    );
    if (!booking) return res.status(409).json({ message: "Only pending reservations can be approved." });
    await logAudit({ category: "Booking", action: "updated", description: `approved booking ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/:id/reject", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["Pending", "Pending Payment Verification"] }, downPayment: { $in: [null, 0] }, paidAmount: { $in: [null, 0] }, paymentStatus: { $ne: "Paid" } },
      { status: Booking.BOOKING_STATUS.REJECTED, reviewedBy: req.user._id, reviewedAt: new Date() },
      { returnDocument: "after", runValidators: true }
    );
    if (!booking) return res.status(409).json({ message: "Only unpaid pending reservations can be rejected; use cancellation review for paid reservations." });
    await logAudit({ category: "Booking", action: "updated", description: `rejected booking ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(updateBookingSchema), async (req, res) => {
  try {
    const {
      status, duration, paymentMethod, timeIn, date, guestName,
      guestEmail, guestContact, guestCount, hasCorkage, downPayment,
      paymentStatus, paidAmount, specialRequests, room, variantLabel,
    } = req.body;

    let booking;
    try {
      booking = await runInTransaction(async (session) => {
        const existing = await Booking.findById(req.params.id).session(session);
        if (!existing) {
          throw { status: 404, message: "Booking not found." };
        }

        const update = {};
        if (status !== undefined && status !== existing.status) {
          if (!["Pending", "Confirmed"].includes(existing.status) || !["Confirmed", "Rejected", "Cancelled", "Done"].includes(status)) throw { status: 409, message: "Use the monitoring controls for session start and completion." };
          if (status === "Rejected" && bookingCollected(existing) > 0) throw { status: 409, message: "Use cancellation review to preserve the payment and record any refund." };
          update.status = status;
          if (status === "Cancelled") Object.assign(update, reviewCancellationFields(existing, { decision: "approve" }, req.user._id));
        }
        if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
        if (guestName !== undefined) update.guestName = guestName;
        if (guestEmail !== undefined) update.guestEmail = guestEmail;
        if (guestContact !== undefined) update.guestContact = guestContact;
        if (guestCount !== undefined) update.guestCount = guestCount;
        if (downPayment !== undefined && downPayment !== Number(existing.downPayment || 0)) throw { status: 400, message: "The original deposit cannot be edited. Record money received or a manual refund." };
        const received = bookingCollected(existing);
        if (paidAmount !== undefined && paidAmount < received) throw { status: 400, message: "Received payments cannot be removed; record a refund through cancellation review." };
        if (paymentStatus !== undefined && paidAmount === undefined && paymentStatus !== existing.paymentStatus) throw { status: 400, message: "Record the actual amount received to change payment status." };
        if (specialRequests !== undefined) update.specialRequests = specialRequests;

        const roomChanging = room !== undefined && String(room) !== String(existing.room);
        const variantChanging = variantLabel !== undefined && (variantLabel || null) !== (existing.variantLabel || null);
        const dateChanging = date !== undefined && date !== existing.date;
        const timeChanging = timeIn !== undefined && timeIn !== existing.timeIn;
        const durationChanging = duration !== undefined && Number(duration) !== existing.duration;
        const scheduleChanging = roomChanging || variantChanging || dateChanging || timeChanging || durationChanging;
        const pricingChanging = scheduleChanging || guestCount !== undefined || hasCorkage !== undefined;
        const financialChanging = pricingChanging || paidAmount !== undefined;
        if (financialChanging || (status !== undefined && status !== existing.status)) {
          if (["Done", "Ongoing", "No Show", "Rejected", "Cancelled"].includes(existing.status)) throw { status: 409, message: "This reservation is closed or has started. Correct its monitoring record instead." };
          if (await RoomSession.exists({ booking: existing._id, status: { $in: ["Active", "Finished"] } }).session(session)) throw { status: 409, message: "Change charges and payments through the linked monitoring session." };
        }

        if (pricingChanging) {
          const effectiveRoomId = room !== undefined ? room : existing.room;
          const effectiveVariantLabel = variantLabel !== undefined ? variantLabel : existing.variantLabel;
          const effectiveDate = date !== undefined ? date : existing.date;
          const effectiveTimeIn = timeIn !== undefined ? timeIn : existing.timeIn;
          const effectiveDuration = duration !== undefined ? Number(duration) : existing.duration;
          const effectiveGuestCount = guestCount !== undefined ? Number(guestCount) : existing.guestCount;
          const effectiveHasCorkage = hasCorkage !== undefined ? hasCorkage : Number(existing.corkageFee) > 0;

          const pricing = await validateAndPriceBooking({
            roomId: effectiveRoomId,
            variantLabel: effectiveVariantLabel || undefined,
            date: effectiveDate,
            timeIn: effectiveTimeIn,
            duration: effectiveDuration,
            isAdminBooking: true,
            guestCount: effectiveGuestCount,
            hasCorkage: effectiveHasCorkage,
            excludeBookingId: existing._id,
            session,
          });

          update.room = pricing.room._id;
          update.roomLabel = pricing.room.name;
          update.variantLabel = effectiveVariantLabel || null;
          update.date = effectiveDate;
          update.timeIn = effectiveTimeIn;
          update.duration = effectiveDuration;
          update.amount = pricing.amount;
          update.roomCharge = pricing.roomCharge;
          update.hourlyRates = pricing.hourlyRates;
          update.corkageFee = pricing.corkageFee;
        }
        const financial = financialFields(update.amount ?? existing.amount, paidAmount ?? received, existing.refundedAmount || 0);
        if (financial.paidAmount - financial.refundedAmount > financial.amount) throw { status: 400, message: "The charge cannot be lower than the collected balance." };
        Object.assign(update, financial);
        if (paidAmount !== undefined && paidAmount !== received) update.paymentUpdatedAt = new Date();

        return Booking.findByIdAndUpdate(req.params.id, update, {
          returnDocument: "after", runValidators: true, session,
        });
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    await logAudit({ category: "Booking", action: "updated", description: `updated booking ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/:id", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const booking = await runInTransaction(async (session) => {
      const existing = await Booking.findById(req.params.id).session(session);
      if (!existing) throw { status: 404, message: "Booking not found." };
      if (bookingCollected(existing) > 0 || !["Pending", "Rejected"].includes(existing.status) || await RoomSession.exists({ booking: existing._id }).session(session)) throw { status: 409, message: "Keep financial history: cancel this reservation instead of deleting it." };
      await Booking.deleteOne({ _id: existing._id }).session(session);
      return existing;
    });
    await logAudit({ category: "Booking", action: "deleted", description: `deleted booking ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    res.json({ message: "Booking deleted." });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

module.exports = router;
