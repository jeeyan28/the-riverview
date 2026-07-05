const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const Booking = require("../model/booking");
const Settings = require("../model/settings");
const { requirePermission, ensureAuthenticated } = require("../middleware/adminAuth");
const { paymentProofUpload } = require("../middleware/upload");
const { PERMISSIONS, isAdminRole } = require("../utils/permissions");

// Down payment required to move a booking out of the "not yet paid" state.
// Percentage of the room's total price, with a peso floor so a 1-hour
// low-rate booking still requires a meaningful commitment.
const DOWN_PAYMENT_PERCENT = 0.3;
const MIN_DOWN_PAYMENT = 100;

function computeDownPayment(amount) {
  return Math.max(MIN_DOWN_PAYMENT, Math.round(amount * DOWN_PAYMENT_PERCENT));
}

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

// ── Create a booking — requires a logged-in session (customer or admin).
//
//    Two distinct paths share this endpoint:
//    - Customer (role "user") booking from the public site: multipart/form-data,
//      must include a `paymentScreenshot` file, gets a down payment calculated
//      server-side, and always starts as "Pending Payment Verification" — the
//      client cannot set its own status/paymentStatus for this path.
//    - Admin/staff (Manual Booking modal, walk-in): plain JSON, no payment proof
//      required, status defaults to "Active" as before.
router.post("/", ensureAuthenticated, paymentProofUpload.single("paymentScreenshot"), async (req, res) => {
  try {
    const { guestName, guestContact, guestEmail, guestCount: guestCountRaw, specialRequests, roomId, variantLabel, date, timeIn, duration: durationRaw, paymentMethod } = req.body;
    const duration = Number(durationRaw);
    const guestCount = guestCountRaw !== undefined && guestCountRaw !== "" ? Number(guestCountRaw) : 1;

    if (!guestName || !roomId || !date || !timeIn || !duration) {
      return res.status(400).json({ message: "guestName, roomId, date, timeIn and duration are required." });
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 5) {
      return res.status(400).json({ message: "Duration must be between 1 and 5 hours." });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Selected room does not exist." });

    let unitPrice = room.price;
    if (room.variants && room.variants.length) {
      const variant = room.variants.find(v => v.label === variantLabel);
      if (!variant) return res.status(400).json({ message: "Selected pricing option not found." });
      unitPrice = variant.price;
    }
    if (!Number.isFinite(unitPrice)) {
      return res.status(400).json({ message: "Could not determine price for this room/option." });
    }

    // Prevent double-booking: reject if the requested window overlaps an existing,
    // still-live booking for the same room/date.
    const startHour = parseInt(String(timeIn).split(":")[0], 10);
    const existing = await Booking.find({
      room: room._id,
      date,
      status: { $nin: ["Cancelled", "Rejected"] },
    }).select("timeIn duration");
    const overlaps = existing.some(b => {
      const bStart = parseInt(String(b.timeIn).split(":")[0], 10);
      return startHour < bStart + b.duration && bStart < startHour + duration;
    });
    if (overlaps) {
      return res.status(409).json({ message: "That time slot was just taken. Please pick another." });
    }

    const amount = unitPrice * duration;
    const isAdminBooking = isAdminRole(req.user.role);

    // Holiday/closure and operating-day enforcement — only for the online
    // customer path. Walk-in bookings taken by staff on-site are allowed to
    // proceed regardless (e.g. a private event the business chooses to host
    // on an otherwise-closed day), matching how the admin calendar/manual
    // booking modal has always worked.
    if (!isAdminBooking) {
      const settings = await Settings.getSingleton();
      const isHoliday = (settings.holidays || []).some(h => h.date === date && h.fullDay);
      const oh = settings.operatingHours || {};
      const openDays = oh.openDays;
      const [yy, mm, dd] = String(date).split("-").map(Number);
      const dayOfWeek = new Date(yy, (mm || 1) - 1, dd || 1).getDay();
      const isClosedDay = Array.isArray(openDays) && openDays.length > 0 && !openDays.includes(dayOfWeek);

      if (isHoliday || isClosedDay) {
        return res.status(409).json({ message: "We're closed on the selected date. Please choose another day." });
      }

      // Time-of-day enforcement — the requested window must fit fully inside
      // the admin's configured operating hours (mirrors the client-side
      // calendar/slot picker in index.js, but re-checked here so this can't
      // be bypassed by calling the API directly).
      const parseHour = (str, fallback) => {
        const h = parseInt(String(str || "").split(":")[0], 10);
        return Number.isFinite(h) ? h : fallback;
      };
      const openHour = parseHour(oh.openTime, 0);
      let closeHour = parseHour(oh.closeTime, 24);
      if (closeHour <= openHour) closeHour += 24; // "00:00" close = midnight/end-of-day
      const endHour = startHour + duration;
      if (startHour < openHour || endHour > closeHour) {
        return res.status(409).json({ message: "That time is outside our operating hours. Please choose another slot." });
      }

      // Booking cutoff — how many hours before the slot's start a booking must
      // be made. maxAdvanceDays is enforced client-side on the calendar; this
      // covers the "book too last-minute" case which the client also blocks
      // but which is worth re-checking server-side.
      const cutoffHours = Number(oh.bookingCutoffHours) || 0;
      if (cutoffHours > 0) {
        const slotStart = new Date(yy, (mm || 1) - 1, dd || 1, startHour, 0, 0, 0);
        const hoursUntilSlot = (slotStart.getTime() - Date.now()) / 3600000;
        if (hoursUntilSlot < cutoffHours) {
          return res.status(409).json({ message: `Bookings must be made at least ${cutoffHours} hour(s) in advance. Please choose a later slot.` });
        }
      }
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
    });

    if (isAdminBooking) {
      // Walk-in / manual booking — no down payment flow, admin sets status directly
      // (defaults to "Active" to match prior behavior of the Manual Booking modal).
      booking.source = "walk-in";
      booking.status = req.body.status || "Active";
      booking.paymentStatus = "Paid";
      booking.downPayment = 0;
    } else {
      // Online customer booking — always requires proof of payment.
      if (!req.file) {
        return res.status(400).json({ message: "Please upload a screenshot of your down payment before submitting." });
      }
      booking.source = "online";
      booking.status = "Pending Payment Verification";
      booking.paymentStatus = "Pending Verification";
      booking.downPayment = computeDownPayment(amount);
      booking.paymentScreenshot = req.file.path;
    }

    await booking.save();
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
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
router.put("/:id", requirePermission(PERMISSIONS.BOOKING_MANAGE), async (req, res) => {
  try {
    const { status, duration, paymentMethod } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (duration !== undefined) update.duration = duration;
    if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;

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