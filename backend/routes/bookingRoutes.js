const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const ReceiptJob = require("../model/receiptJob");
const Settings = require("../model/settings");
const BookingLock = require("../model/bookingLock");
const { RoomSession } = require("../model/monitoring");
const { bookingCollected, bookingStartMs, completeReservationFields, financialFields, manualReservationPaymentFields, reviewCancellationFields } = require("../utils/bookingLifecycle");
const { LOCK_DURATION_MINUTES } = BookingLock;
const { requirePermission, ensureAuthenticated } = require("../middleware/adminAuth");
const { paymentProofUpload } = require("../middleware/upload");
const { PERMISSIONS, isAdminRole, hasPermission } = require("../utils/permissions");
const { validateAndPriceBooking, saveWithReservationCode, runInTransaction } = require("../utils/bookingHelper");
const { repriceExistingBooking, quoteOnlineBooking, parsePaxCapacity } = require("../utils/roomPricing");
const { operatingWindowForStart } = require('../utils/bookingSchedule');
const { shiftDate, nearbyDates, availabilityRows } = require("../utils/bookingSchedule");
const { validate, Joi } = require("../middleware/validate");
const {
  bookingIdParamsSchema,
  availabilityQuerySchema,
  monthAvailabilityQuerySchema,
  emptyBodySchema,
  lockSchema,
  createBookingSchema,
  rescheduleSchema,
  updateBookingSchema,
  cancellationRequestSchema,
  cancellationReviewSchema,
} = require("../validation/bookingSchemas");
const { logAudit } = require("../utils/auditLog");
const { bookingActionLimiter, availabilityLimiter } = require("../middleware/rateLimiter");
const { CLOSABLE_STATUSES, AUTOMATIC_REFUND_STATUSES, isClosurePending, isBookingCustomer } = require("../utils/closurePolicy");
const { queueClosureRefund, processClosureRefund, retryUnsubmittedClosureRefund, completeManualClosureRefund } = require("../utils/closureRefunds");
const { notifyReservation, deliverNotificationEmails } = require("../utils/reservationNotifications");
const { validDateKey } = require("../utils/businessDate");
const AppError = require("../utils/appError");

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const slotsQuerySchema = availabilityQuerySchema.keys({
  duration: Joi.number().integer().min(1).max(5).default(1), guestCount: Joi.number().integer().min(1).max(100).default(1),
  paymentChoice: Joi.string().valid('deposit', 'full').default('deposit'), claimDiscount: Joi.boolean().default(false),
});

router.get('/slots', availabilityLimiter, validate(slotsQuerySchema, 'query'), async (req, res) => {
  const { roomId, date, variantLabel, duration, guestCount, paymentChoice, claimDiscount } = req.query;
  const room = await require('../model/room').findById(roomId).lean();
  if (!room) throw new AppError(404, 'Facility not found.');
  const settings = await Settings.getSingleton();
  const selectedVariant = (room.variants || []).find(variant => variant.label === variantLabel);
  if (room.variants?.length && !selectedVariant) throw new AppError(400, 'Choose a configured room type.');
  const hours = settings.operatingHours || {};
  const { openHour, closeHour } = operatingWindowForStart(date, hours.openTime, hours.openTime, hours.closeTime);
  const slots = [];
  for (let hour = openHour; hour < closeHour; hour++) {
    const actualDate = hour >= 24 ? shiftDate(date, 1) : date;
    const timeIn = `${String(hour % 24).padStart(2, '0')}:00`;
    const selection = { roomId, variantLabel, date: actualDate, timeIn, duration, guestCount, isAdminBooking: false };
    try {
      const priced = await validateAndPriceBooking(selection);
      const quote = quoteOnlineBooking({ room: priced.room, variant: priced.selectedVariant, basePrice: priced, paymentChoice, claimDiscount });
      slots.push({ date: actualDate, timeIn, displayHour: hour, startsNextDay: hour >= 24, state: 'available', quote: { amount: quote.amount, downPayment: quote.downPayment, remainingBalance: Math.round((quote.amount - quote.downPayment) * 100) / 100 } });
    } catch (error) {
      if (![400, 404, 409].includes(error.status)) throw error;
      slots.push({ date: actualDate, timeIn, displayHour: hour, startsNextDay: hour >= 24, state: error.code === 'VENUE_CLOSED' ? 'closed' : error.code === 'SLOT_FULL' ? 'full' : 'outside_hours', reason: error.message });
    }
  }
  res.json({ timeZone: 'Asia/Manila', serviceDate: date, operatingHours: hours, guestCapacity: parsePaxCapacity(selectedVariant?.pax) || room.capacity || null, slots });
});

router.get("/", requirePermission(PERMISSIONS.BOOKING_VIEW), async (req, res) => {
  try {
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
      filter.$or = [{ guestName: re }, { guestContact: re }, { guestEmail: re }, { reservationCode: re }];
    }

    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).populate("room", "name variants");
    const receipts = await ReceiptJob.find({ booking: { $in: bookings.map(item => item._id) } }).select('booking state version').sort({ version: -1 }).lean();
    res.json(bookings.map(item => ({ ...item.toObject(), receiptStatus: receipts.find(job => String(job.booking) === String(item._id))?.state || 'not_prepared' })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/availability", availabilityLimiter, validate(availabilityQuerySchema, "query"), async (req, res) => {
  try {
    const { roomId, date, variantLabel } = req.query;
    const filter = {
      room: roomId,
      date: { $in: nearbyDates(date) },
      status: { $nin: [Booking.BOOKING_STATUS.CANCELLED, Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.NO_SHOW] },
    };
    if (variantLabel) filter.variantLabel = variantLabel;

    const bookings = await Booking.find(filter).select("date timeIn duration");

    const lockFilter = { room: roomId, date: { $in: nearbyDates(date) }, expiresAt: { $gt: new Date() } };
    if (variantLabel) lockFilter.variantLabel = variantLabel;
    if (req.session?.userId) lockFilter.lockedBy = { $ne: req.session.userId };
    const locks = await BookingLock.find(lockFilter).select("date timeIn duration");

    res.json(availabilityRows([...bookings, ...locks], date));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});


router.get("/availability-month", availabilityLimiter, validate(monthAvailabilityQuerySchema, "query"), async (req, res) => {
  try {
    const { roomId, year, month, variantLabel } = req.query;
    const y = year;
    const m = month;

    const lastDay = new Date(y, m, 0).getDate();
    const startStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const endStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const filter = {
      room: roomId,
      date: { $gte: shiftDate(startStr, -1), $lte: shiftDate(endStr, 1) },
      status: { $nin: [Booking.BOOKING_STATUS.CANCELLED, Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.NO_SHOW] },
    };

    if (variantLabel) filter.variantLabel = variantLabel;

    const bookings = await Booking.find(filter).select("date timeIn duration");

    const lockFilter = {
      room: roomId,
      date: { $gte: shiftDate(startStr, -1), $lte: shiftDate(endStr, 1) },
      expiresAt: { $gt: new Date() },
    };
    if (variantLabel) lockFilter.variantLabel = variantLabel;
    if (req.session?.userId) lockFilter.lockedBy = { $ne: req.session.userId };
    const locks = await BookingLock.find(lockFilter).select("date timeIn duration");

    const byDate = {};
    [...bookings, ...locks].forEach((b) => {
      for (const offset of [-1, 0, 1]) {
        const serviceDate = shiftDate(b.date, offset);
        if (serviceDate < startStr || serviceDate > endStr) continue;
        if (!byDate[serviceDate]) byDate[serviceDate] = [];
        byDate[serviceDate].push(...availabilityRows([b], serviceDate));
      }
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
      return res.status(e.status || 500).json({ message: AppError.publicMessage(e, "Server error.") });
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
    res.status(503).json({ message: "Could not release the hold. Please try again.", code: "HOLD_UNAVAILABLE" });
  }
});

router.post("/", requirePermission(PERMISSIONS.BOOKING_MANAGE), paymentProofUpload.single("paymentScreenshot"), validate(createBookingSchema), async (req, res) => {
  try {
    const isAdminBooking = isAdminRole(req.user.role);
    if (!isAdminBooking) {
      return res.status(400).json({
        message: "Manual payment is no longer available. Please reserve and pay through the secure online checkout (POST /api/payments/paymongo/checkout).",
      });
    }

    const { guestName, guestContact, guestEmail, guestCount, specialRequests, roomId, variantLabel, date, timeIn, duration, paymentMethod, paymentChoice } = req.body;

    let booking;
    try {
      booking = await runInTransaction(async (session) => {
        const { room, amount, roomCharge, hourlyRates } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount, session });
        const payment = manualReservationPaymentFields({ amount, hourlyRates, duration, paymentChoice, paidAmount: req.body.paidAmount });

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
          ...(paymentMethod ? { paymentMethod } : {}),
          bookedBy: req.session.userId,
          source: "walk-in",
          status: Booking.BOOKING_STATUS.CONFIRMED,
          ...payment,
          paymentUpdatedAt: payment.paidAmount > 0 ? new Date() : undefined,
        });

        await saveWithReservationCode(b, room.name, undefined, session);
        return b;
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: AppError.publicMessage(e, "Server error.") });
    }

    await logAudit({ category: "Booking", action: "created", description: `created manual reservation ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/mine", ensureAuthenticated, async (req, res) => {
  try {
    const bookings = await Booking.find({ $or: [{ bookedBy: req.user._id }, { "venueClosure.customerUserId": req.user._id }] }).sort({ createdAt: -1 }).populate("room", "name");
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", ensureAuthenticated, validate(bookingIdParamsSchema, "params"), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("room", "name");
    if (!booking) return res.status(404).json({ message: "Reservation not found." });

    if (!isBookingCustomer(booking, req.user._id) && !isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Not allowed." });
    }
    const receipt = await ReceiptJob.findOne({ booking: booking._id }).sort({ version: -1 }).select('state').lean();
    res.json({ ...booking.toObject(), receiptStatus: receipt?.state || 'not_prepared' });
  } catch (err) {
    console.error('Reservation lookup unavailable:', { requestId: req.id, category: err.name });
    res.status(503).json({ message: "We could not load this reservation. Please retry.", code: "RESERVATION_UNAVAILABLE", requestId: req.id });
  }
});

router.put("/:id/reschedule", ensureAuthenticated, bookingActionLimiter, validate(bookingIdParamsSchema, "params"), validate(rescheduleSchema), async (req, res) => {
  try {
    const { date, timeIn } = req.body;
    if (!validDateKey(date) || bookingStartMs(date, timeIn) <= Date.now()) return res.status(400).json({ message: "Choose a future reservation date and time." });

    let booking;
    try {
      booking = await runInTransaction(async (session) => {
        const existing = await Booking.findById(req.params.id).session(session);
        if (!existing) throw new AppError(404, "Reservation not found.");
        if (!isBookingCustomer(existing, req.user._id)) {
          throw new AppError(403, "Not allowed.");
        }
        const closureChange = isClosurePending(existing);
        if (existing.status !== Booking.BOOKING_STATUS.CONFIRMED && !(closureChange && CLOSABLE_STATUSES.includes(existing.status))) {
          throw new AppError(409, "Only confirmed reservations can be rescheduled.");
        }
        if (existing.cancellationStatus === "Requested") throw new AppError(409, "Wait for the cancellation review before rescheduling.");
        if (!closureChange && existing.rescheduleCount >= Booking.MAX_RESCHEDULES) {
          throw new AppError(409, "This reservation has already been rescheduled the maximum number of times.");
        }
        const originalStart = bookingStartMs(existing.date, existing.timeIn);
        if (!closureChange && (!Number.isFinite(originalStart) || originalStart - Date.now() < 24 * 60 * 60 * 1000)) {
          throw new AppError(409, "Reschedule at least 24 hours before your reservation starts.");
        }

        const pricing = await validateAndPriceBooking({
          roomId: existing.room,
          variantLabel: existing.variantLabel || undefined,
          date,
          timeIn,
          duration: existing.duration,
          isAdminBooking: false,
          guestCount: existing.guestCount,
          excludeBookingId: existing._id,
          session,
        });

        const repriced = repriceExistingBooking(pricing, existing);
        const financial = financialFields(repriced.amount, bookingCollected(existing), existing.refundedAmount || 0);
        if (financial.paidAmount - financial.refundedAmount > financial.amount) {
          throw new AppError(409, "The new slot costs less than the amount already collected. Choose an equal or higher-priced slot, or contact the venue.");
        }
        const updated = await Booking.findByIdAndUpdate(
          req.params.id,
          {
            $set: {
              date,
              timeIn,
              amount: repriced.amount,
              roomCharge: pricing.roomCharge,
              discountAmount: repriced.discountAmount,
              eligibleDiscount: repriced.eligibleDiscount,
              addOnFee: repriced.addOnFee,
              hourlyRates: pricing.hourlyRates,
              ...financial,
              ...(closureChange ? { "venueClosure.status": "rescheduled", "venueClosure.resolvedAt": new Date() } : {}),
            },
            ...(!closureChange ? { $inc: { rescheduleCount: 1 } } : {}),
          },
          { returnDocument: "after", runValidators: true, session }
        );
        if (closureChange) await notifyReservation(updated, "rescheduled", { session });
        return updated;
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: AppError.publicMessage(e, "Server error.") });
    }

    if (booking.venueClosure?.status === "rescheduled") await deliverNotificationEmails({ limit: 5 });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/:id/closure-refund", ensureAuthenticated, bookingActionLimiter, validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const booking = await runInTransaction(async session => {
      const existing = await Booking.findById(req.params.id).session(session);
      if (!existing) throw new AppError(404, "Reservation not found.");
      if (!isBookingCustomer(existing, req.user._id) && !hasPermission(req.user, PERMISSIONS.BOOKING_MANAGE)) throw new AppError(403, "Not allowed.");
      if (queueClosureRefund(existing, req.user._id)) {
        await existing.save({ session });
        await notifyReservation(existing, "refund_processing", { session });
        if (existing.closureRefund.status === "manual_required") await notifyReservation(existing, "refund_attention", { session });
      }
      return existing;
    });
    await processClosureRefund(booking._id);
    await deliverNotificationEmails({ limit: 5 });
    res.json(await Booking.findById(booking._id));
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: AppError.publicMessage(err, "Could not request the refund. Check your reservation before trying again.") });
  }
});

router.put("/:id/closure-refund/check", requirePermission(PERMISSIONS.POS_REFUND), validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking?.closureRefund) return res.status(404).json({ message: "Closure refund not found." });
  await processClosureRefund(booking._id, { force: true });
  await deliverNotificationEmails({ limit: 5 });
  res.json(await Booking.findById(booking._id));
});

router.put("/:id/closure-refund/retry", requirePermission(PERMISSIONS.POS_REFUND), bookingActionLimiter, validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const booking = await retryUnsubmittedClosureRefund(req.params.id);
    await logAudit({ category: "Booking", action: "updated", description: `Retried an unsubmitted closure refund for ${booking.reservationCode}`, user: req.user });
    await deliverNotificationEmails({ limit: 5 });
    res.json(booking);
  } catch (error) {
    res.status(error.status || 500).json({ message: AppError.publicMessage(error, "Could not retry the refund. Check the current refund status before trying again.") });
  }
});

router.put("/:id/cancellation-request", ensureAuthenticated, bookingActionLimiter, validate(bookingIdParamsSchema, "params"), validate(cancellationRequestSchema), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Reservation not found." });
    if (isClosurePending(booking)) return res.status(409).json({ message: "Use the venue closure options to reschedule or receive a full refund." });
    if (String(booking.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) return res.status(403).json({ message: "Not allowed." });
    if (booking.status !== Booking.BOOKING_STATUS.CONFIRMED) return res.status(409).json({ message: "Only confirmed reservations can be cancelled." });
    if (booking.cancellationStatus === "Requested") return res.status(409).json({ message: "A cancellation request is already waiting for review." });
    const updated = await Booking.findOneAndUpdate({ _id: booking._id, status: "Confirmed", cancellationStatus: { $ne: "Requested" }, "venueClosure.status": { $ne: "pending" } }, { $set: {
      cancellationStatus: "Requested", cancellationSource: "customer", cancellationRefundException: false,
      cancellationRequestedAt: new Date(), cancellationReason: req.body.reason,
    } }, { returnDocument: "after", runValidators: true });
    if (!updated) return res.status(409).json({ message: "This reservation changed. Refresh it to view the available options." });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: AppError.publicMessage(err, "Could not request cancellation.") });
  }
});

router.put("/:id/cancellation-review", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(cancellationReviewSchema), async (req, res) => {
  try {
    const { booking, recordedRefund, wasRequested } = await runInTransaction(async (session) => {
      const booking = await Booking.findById(req.params.id).session(session);
      if (!booking) throw new AppError(404, "Reservation not found.");
      if (AUTOMATIC_REFUND_STATUSES.includes(booking.closureRefund?.status)) throw new AppError(409, "An online refund is being processed or verified. Check the provider status before recording another refund.");
      const wasRequested = booking.cancellationStatus === "Requested";
      const alreadyApproved = booking.cancellationStatus === "Approved" && booking.status === "Cancelled";
      if (!wasRequested && !alreadyApproved) throw new AppError(409, "There is no cancellation to review or refund to record.");
      if (alreadyApproved && req.body.decision !== "approve") throw new AppError(409, "An approved cancellation cannot be rejected.");
      if ((Number(req.body.refundedAmount) > Number(booking.refundedAmount || 0) || req.body.refundException) && !hasPermission(req.user, PERMISSIONS.POS_REFUND)) throw new AppError(403, "Refund permission required.");
      const previousRefund = Number(booking.refundedAmount || 0);
      const fields = reviewCancellationFields(booking, {
        decision: req.body.decision,
        refundedAmount: req.body.refundedAmount,
        refundException: req.body.refundException,
        note: req.body.note,
      }, req.user._id);
      if (alreadyApproved && fields.refundedAmount === previousRefund && fields.cancellationRefundException === Boolean(booking.cancellationRefundException)) {
        throw new AppError(400, "Record a new manual refund amount or an explained policy exception.");
      }
      Object.assign(booking, fields);
      await booking.save({ session });
      await completeManualClosureRefund(booking, session);
      return { booking, recordedRefund: fields.refundedAmount - previousRefund, wasRequested };
    });
    await logAudit({ category: "Booking", action: "updated", description: `${wasRequested ? `${req.body.decision === "reject" ? "rejected" : "approved"} cancellation` : "updated cancellation refund"} for ${booking.reservationCode}; newly recorded refund ₱${recordedRefund.toFixed(2)}${booking.cancellationRefundException ? "; policy exception" : ""}${req.body.note ? `; note: ${req.body.note}` : ""}`, user: req.user });
    if (booking.closureRefund) await deliverNotificationEmails({ limit: 5 });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: AppError.publicMessage(err, "Could not review cancellation.") });
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
      { _id: req.params.id, status: { $in: ["Pending", "Pending Payment Verification"] }, "venueClosure.status": { $ne: "pending" }, downPayment: { $in: [null, 0] }, paidAmount: { $in: [null, 0] }, paymentStatus: { $ne: "Paid" } },
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

router.put("/:id/mark-done", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const booking = await runInTransaction(async (session) => {
      const existing = await Booking.findById(req.params.id).session(session);
      if (!existing) throw new AppError(404, "Reservation not found.");
      const hasMonitorSession = Boolean(await RoomSession.exists({ booking: existing._id, status: { $in: ["Active", "Finished"] } }).session(session));
      const update = completeReservationFields(existing, { hasMonitorSession });
      return Booking.findByIdAndUpdate(existing._id, update, { returnDocument: "after", runValidators: true, session });
    });
    await logAudit({ category: "Booking", action: "updated", description: `marked booking ${booking.reservationCode} done for ${booking.guestName}`, user: req.user });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: AppError.publicMessage(err, "Could not mark this reservation done.") });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.BOOKING_MANAGE), validate(bookingIdParamsSchema, "params"), validate(updateBookingSchema), async (req, res) => {
  try {
    const {
      status, duration, paymentMethod, timeIn, date, guestName,
      guestEmail, guestContact, guestCount, downPayment,
      paymentStatus, paidAmount, specialRequests, room, variantLabel,
    } = req.body;

    let booking;
    let auditChanges = [];
    try {
      booking = await runInTransaction(async (session) => {
        const existing = await Booking.findById(req.params.id).session(session);
        if (!existing) {
          throw new AppError(404, "Reservation not found.");
        }
        if (isClosurePending(existing) && status && status !== existing.status) throw new AppError(409, "Use the closure refund option to cancel this reservation, or move it to an open date.");

        const update = {};
        const correctingNoShow = existing.status === Booking.BOOKING_STATUS.NO_SHOW && status === Booking.BOOKING_STATUS.DONE;
        if (status !== undefined && status !== existing.status) {
          const allowed = existing.status === Booking.BOOKING_STATUS.PENDING
            ? [Booking.BOOKING_STATUS.CONFIRMED, Booking.BOOKING_STATUS.REJECTED, Booking.BOOKING_STATUS.CANCELLED]
            : existing.status === Booking.BOOKING_STATUS.CONFIRMED
              ? [Booking.BOOKING_STATUS.DONE, Booking.BOOKING_STATUS.CANCELLED]
              : [];
          if (!correctingNoShow && !allowed.includes(status)) throw new AppError(409, "Use the reservation or monitoring controls for this status change.");
          if (correctingNoShow && Object.keys(req.body).some((key) => key !== "status")) throw new AppError(400, "Only the status can be corrected on a no-show reservation.");
          if (status === Booking.BOOKING_STATUS.DONE && existing.status === Booking.BOOKING_STATUS.CONFIRMED) {
            if (existing.cancellationStatus === "Requested") throw new AppError(409, "Review the cancellation request before completing this reservation.");
            const start = bookingStartMs(existing.date, existing.timeIn);
            if (!Number.isFinite(start) || start > Date.now()) throw new AppError(409, "A reservation cannot be completed before its start time.");
          }
          if (status === "Rejected" && bookingCollected(existing) > 0) throw new AppError(409, "Use cancellation review to preserve the payment and record any refund.");
          update.status = status;
          if (correctingNoShow) update.noShowAt = null;
          if (status === "Cancelled") Object.assign(update, reviewCancellationFields(existing, {
            decision: "approve",
            cancellationSource: existing.cancellationStatus === "Requested" ? "customer" : "admin",
          }, req.user._id));
        }
        if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
        if (guestName !== undefined) update.guestName = guestName;
        if (guestEmail !== undefined) update.guestEmail = guestEmail;
        if (guestContact !== undefined) update.guestContact = guestContact;
        if (guestCount !== undefined) update.guestCount = guestCount;
        if (downPayment !== undefined && downPayment !== Number(existing.downPayment || 0)) throw new AppError(400, "The original deposit cannot be edited. Record money received or a manual refund.");
        const received = bookingCollected(existing);
        if (paidAmount !== undefined && paidAmount < received) throw new AppError(400, "Received payments cannot be removed; record a refund through cancellation review.");
        if (paymentStatus !== undefined && paidAmount === undefined && paymentStatus !== existing.paymentStatus) throw new AppError(400, "Record the actual amount received to change payment status.");
        if (specialRequests !== undefined) update.specialRequests = specialRequests;

        const roomChanging = room !== undefined && String(room) !== String(existing.room);
        const variantChanging = variantLabel !== undefined && (variantLabel || null) !== (existing.variantLabel || null);
        const dateChanging = date !== undefined && date !== existing.date;
        const timeChanging = timeIn !== undefined && timeIn !== existing.timeIn;
        const durationChanging = duration !== undefined && Number(duration) !== existing.duration;
        const scheduleChanging = roomChanging || variantChanging || dateChanging || timeChanging || durationChanging;
        auditChanges = [];
        if (scheduleChanging) auditChanges.push("rescheduled");
        if (paidAmount !== undefined && paidAmount > bookingCollected(existing)) auditChanges.push("recorded payment for");
        if (status === "Cancelled") auditChanges.push("cancelled");
        const pricingChanging = scheduleChanging || guestCount !== undefined;
        const financialChanging = pricingChanging || paidAmount !== undefined;
        if (financialChanging || (status !== undefined && status !== existing.status)) {
          if (["Done", "Ongoing", "No Show", "Rejected", "Cancelled"].includes(existing.status) && !correctingNoShow) throw new AppError(409, "This reservation is closed or has started. Correct its monitoring record instead.");
          if (await RoomSession.exists({ booking: existing._id, status: { $in: ["Active", "Finished"] } }).session(session)) throw new AppError(409, "Change charges and payments through the linked monitoring session.");
        }

        if (pricingChanging) {
          const effectiveRoomId = room !== undefined ? room : existing.room;
          const effectiveVariantLabel = variantLabel !== undefined ? variantLabel : existing.variantLabel;
          const effectiveDate = date !== undefined ? date : existing.date;
          const effectiveTimeIn = timeIn !== undefined ? timeIn : existing.timeIn;
          const effectiveDuration = duration !== undefined ? Number(duration) : existing.duration;
          const effectiveGuestCount = guestCount !== undefined ? Number(guestCount) : existing.guestCount;
          if (isClosurePending(existing) && (!validDateKey(effectiveDate) || bookingStartMs(effectiveDate, effectiveTimeIn) <= Date.now())) throw new AppError(400, "Move the closure-affected reservation to a future open date and time.");

          const pricing = await validateAndPriceBooking({
            roomId: effectiveRoomId,
            variantLabel: effectiveVariantLabel || undefined,
            date: effectiveDate,
            timeIn: effectiveTimeIn,
            duration: effectiveDuration,
            isAdminBooking: !isClosurePending(existing),
            guestCount: effectiveGuestCount,
            excludeBookingId: existing._id,
            session,
          });

          update.room = pricing.room._id;
          update.roomLabel = pricing.room.name;
          update.variantLabel = effectiveVariantLabel || null;
          update.date = effectiveDate;
          update.timeIn = effectiveTimeIn;
          update.duration = effectiveDuration;
          const repriced = repriceExistingBooking(pricing, existing);
          update.amount = repriced.amount;
          update.roomCharge = pricing.roomCharge;
          update.discountAmount = repriced.discountAmount;
          update.eligibleDiscount = repriced.eligibleDiscount;
          update.addOnFee = repriced.addOnFee;
          update.hourlyRates = pricing.hourlyRates;
        }
        const financial = financialFields(update.amount ?? existing.amount, paidAmount ?? received, existing.refundedAmount || 0);
        if (financial.paidAmount - financial.refundedAmount > financial.amount) throw new AppError(400, "The charge cannot be lower than the collected balance.");
        Object.assign(update, financial);
        if (paidAmount !== undefined && paidAmount !== received) update.paymentUpdatedAt = new Date();

        if (scheduleChanging && isClosurePending(existing)) {
          update["venueClosure.status"] = "rescheduled";
          update["venueClosure.resolvedAt"] = new Date();
        }
        const updated = await Booking.findByIdAndUpdate(req.params.id, update, {
          returnDocument: "after", runValidators: true, session,
        });
        if (scheduleChanging && isClosurePending(existing)) await notifyReservation(updated, "rescheduled", { session });
        return updated;
      });
    } catch (e) {
      return res.status(e.status || 500).json({ message: AppError.publicMessage(e, "Server error.") });
    }

    await logAudit({ category: "Booking", action: "updated", description: `${auditChanges.length ? auditChanges.join(' and ') : 'updated'} booking ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    if (booking.venueClosure?.status === "rescheduled") await deliverNotificationEmails({ limit: 5 });
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
      if (!existing) throw new AppError(404, "Reservation not found.");
      if (bookingCollected(existing) > 0 || !["Pending", "Rejected"].includes(existing.status) || await RoomSession.exists({ booking: existing._id }).session(session)) throw new AppError(409, "Keep financial history: cancel this reservation instead of deleting it.");
      await Booking.deleteOne({ _id: existing._id }).session(session);
      return existing;
    });
    await logAudit({ category: "Booking", action: "deleted", description: `deleted booking ${booking.reservationCode} for ${booking.guestName}`, user: req.user });
    res.json({ message: "Reservation deleted." });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: AppError.publicMessage(err, "Server error.") });
  }
});

module.exports = router;
