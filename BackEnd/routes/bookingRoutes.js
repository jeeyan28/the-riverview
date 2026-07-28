const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const Settings = require("../model/settings");
const { requirePermission, ensureAuthenticated } = require("../middleware/adminAuth");
const { paymentProofUpload } = require("../middleware/upload");
const { PERMISSIONS, isAdminRole } = require("../utils/permissions");
const { validateAndPriceBooking, computeDownPayment, saveWithReservationCode, runInTransaction } = require("../utils/bookingHelper");


router.get("/", requirePermission(PERMISSIONS.BOOKING_VIEW), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.room) filter.room = req.query.room;
    if (req.query.date) filter.date = req.query.date;
    // Exact-match guest filters (distinct from the fuzzy `search` below) — used to pull
    // a single guest's full booking history, e.g. "View All History".
    if (req.query.guestContact) filter.guestContact = req.query.guestContact;
    else if (req.query.guestName) filter.guestName = req.query.guestName;
    if (req.query.search) {
      // Escape regex metacharacters so a search like "juan (2)" doesn't throw.
      const safe = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safe, "i");
      filter.$or = [{ guestName: re }, { guestContact: re }, { reservationCode: re }];
    }

    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
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
    res.json(bookings.map(b => ({ timeIn: b.timeIn, duration: b.duration })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});


router.get("/availability-month", async (req, res) => {
  try {
    const { roomId, year, month, variantLabel } = req.query; // month is 1-12
    if (!roomId || !year || !month) {
      return res.status(400).json({ message: "roomId, year and month are required." });
    }

    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ message: "Invalid year or month." });
    }

    // Dates are stored as "YYYY-MM-DD" strings, so a plain lexical range over
    // that same format is enough to bound the query to this month.
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

    // Group by date so the client gets { "2026-07-14": [{timeIn, duration}, ...] }
    const byDate = {};
    bookings.forEach((b) => {
      if (!byDate[b.date]) byDate[b.date] = [];
      byDate[b.date].push({ timeIn: b.timeIn, duration: b.duration });
    });

    res.json(byDate);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
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
          roomLabel: room.roomNumber || room.name,
          variantLabel: variantLabel || null,
          date,
          timeIn,
          duration,
          amount,
          ...(paymentMethod ? { paymentMethod } : {}), // falls back to the schema's own "Cash" default
          bookedBy: req.session.userId,
          // Walk-in / manual booking — no down payment flow, admin sets status directly
          // (defaults to "Active" to match prior behavior of the Manual Booking modal).
          source: "walk-in",
          status: req.body.status || "Active",
          paymentStatus: "Paid",
          // downPayment omitted — schema already defaults to 0
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
    const bookings = await Booking.find({ bookedBy: req.user._id }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
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

// ── Approve a booking's payment — admin only. Moves it from
//    "Pending Payment Verification" to "Confirmed" and marks payment as Paid.
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

// ── Reject a booking's payment — admin only (e.g. screenshot doesn't match,
//    wrong amount, fraudulent proof).
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
    const { status, duration, paymentMethod, timeIn, date, guestName } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (duration !== undefined) update.duration = duration;
    if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;
    if (timeIn !== undefined) update.timeIn = timeIn;
    if (date !== undefined) update.date = date;
    if (guestName !== undefined) update.guestName = guestName;

    const booking = await Booking.findByIdAndUpdate(req.params.id, update, { returnDocument: "after", runValidators: true });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Delete/cancel a booking — admin only
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