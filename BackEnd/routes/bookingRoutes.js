const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const Booking = require("../model/booking");
const Settings = require("../model/settings");
const { requirePermission, ensureAuthenticated } = require("../middleware/adminAuth");
const { paymentProofUpload } = require("../middleware/upload");
const { PERMISSIONS, isAdminRole } = require("../utils/permissions");
const { validateAndPriceBooking, computeDownPayment } = require("../utils/bookingHelper");

// ── List all bookings — admin only. Supports the Booking Management search/filter UI:
//    ?search=   matches guest name or contact (case-insensitive, partial)
//    ?status=   exact booking status
//    ?paymentStatus= exact payment status
//    ?room=     room ObjectId
//    ?date=     exact date (YYYY-MM-DD)
router.get("/", requirePermission(PERMISSIONS.BOOKING_VIEW), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.room) filter.room = req.query.room;
    if (req.query.date) filter.date = req.query.date;
    if (req.query.search) {
      // Escape regex metacharacters so a search like "juan (2)" doesn't throw.
      const safe = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safe, "i");
      filter.$or = [{ guestName: re }, { guestContact: re }];
    }

    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Public availability check — used by the booking calendar/slot picker so
//    guests (not just logged-in admins) can see which hours are already taken.
//    Deliberately returns only the room/date/time/duration needed to block out
//    slots — no guest names, contact info, or payment/screenshot data.
router.get("/availability", async (req, res) => {
  try {
    const { roomId, date } = req.query;
    if (!roomId || !date) {
      return res.status(400).json({ message: "roomId and date are required." });
    }

    const bookings = await Booking.find({
      room: roomId,
      date,
      status: { $nin: ["Cancelled", "Rejected"] },
    }).select("timeIn duration");

    res.json(bookings.map(b => ({ timeIn: b.timeIn, duration: b.duration })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Public month availability check — powers the calendar's day grid so it
//    reflects THIS room's own bookings (a day that's fully booked for Room A
//    should not appear open just because Room B is free that day). Returns,
//    for every date in the given month that has at least one active booking,
//    the list of reserved hour-ranges so the frontend can work out which days
//    are fully booked for that specific room.
router.get("/availability-month", async (req, res) => {
  try {
    const { roomId, year, month } = req.query; // month is 1-12
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

    const bookings = await Booking.find({
      room: roomId,
      date: { $gte: startStr, $lte: endStr },
      status: { $nin: ["Cancelled", "Rejected"] },
    }).select("date timeIn duration");

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

// ── Create a booking — requires a logged-in session (customer or admin).
//
//    Manual/screenshot payment has been removed entirely: the ONLY way a
//    customer (role "user") can now pay is the automatic PayMongo checkout
//    at POST /api/payments/paymongo/checkout (routes/paymongoRoutes.js),
//    which is what the public booking page calls. This endpoint therefore
//    only ever creates bookings for:
//    - Admin/staff (Manual Booking modal, walk-in / Room Monitoring): plain
//      JSON, no payment proof required, status defaults to "Active" as before.
//    A non-admin hitting this endpoint directly gets a clear error pointing
//    them at the online-checkout endpoint instead, rather than silently
//    accepting an unpaid/unverifiable booking.
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

    let room, amount;
    try {
      ({ room, amount } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount }));
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    const booking = new Booking({
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
      paymentMethod: paymentMethod || "Cash",
      bookedBy: req.session.userId,
      // Walk-in / manual booking — no down payment flow, admin sets status directly
      // (defaults to "Active" to match prior behavior of the Manual Booking modal).
      source: "walk-in",
      status: req.body.status || "Active",
      paymentStatus: "Paid",
      downPayment: 0,
    });

    await booking.save();
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Get bookings for the logged-in user — powers the profile page's
//    Booking History panel. Any authenticated user (not admin-only), and
//    scoped to their own bookings only. Placed before GET /:id so "mine"
//    isn't swallowed as an :id param.
router.get("/mine", ensureAuthenticated, async (req, res) => {
  try {
    const bookings = await Booking.find({ bookedBy: req.user._id }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Get a single booking — used by the public booking page to render the
//    professional booking summary (room/date/time/duration/pax/payment
//    status/reference) right after checkout. Only the guest who made the
//    booking (bookedBy) or an admin may view it — this is deliberately NOT
//    fully public, since it includes guest contact info.
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
      { status: "Confirmed", paymentStatus: "Paid", reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true, runValidators: true }
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
      { status: "Rejected", paymentStatus: "Rejected", reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Update a booking (edit duration/payment method, or change status —
//    e.g. Active/Done/Overdue/Cancelled) — admin only
//    timeIn/date/guestName are additionally editable so Room Monitoring can
//    "Edit" a live walk-in session — re-anchoring its start time to now and
//    setting a fresh remaining duration (hours/minutes/seconds) rather than
//    only being able to change the total original duration.
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

    const booking = await Booking.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
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