const Room = require("../model/room");
const Booking = require("../model/booking");
const Settings = require("../model/settings");

// Online/customer booking duration bounds — whole hours only. Admin/walk-in
// bookings aren't bound by this (see isAdminBooking branch below). Mirrors
// Frontend/src/components/BookingModal.jsx's MAX_DURATION — keep both in
// sync (separate runtimes, no shared module possible).
const MIN_ONLINE_DURATION_HOURS = 1;
const MAX_ONLINE_DURATION_HOURS = 5;

// Down payment required to move a booking out of the "not yet paid" state.
// Equal to the room/variant's FIRST HOUR rate (unitPrice), regardless of how
// many hours are ultimately booked — e.g. a 4-hour booking at ₱200/hr only
// requires a ₱200 down payment, not a percentage of the ₱800 total.
// Kept here (single source of truth) so bookingRoutes.js and
// paymongoRoutes.js can never drift out of sync on this calculation.
function computeDownPayment(unitPrice) {
  const price = Number(unitPrice) || 0;
  return Math.max(0, Math.round(price));
}

// Validates a prospective booking (room/variant exists, no double-booking,
// operating hours/holidays/cutoff for the online/customer path) and returns
// the priced result. Throws an object shaped like { status, message } on any
// validation failure so callers can just res.status(e.status).json({message:e.message}).
//
// This is exactly the logic that used to live inline in bookingRoutes.js's
// POST / handler — pulled out unchanged so the new automatic PayMongo
// checkout endpoint can reuse it instead of re-implementing (and risking
// drifting from) the same rules.
async function validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount }) {
  if (!roomId || !date || !timeIn || !duration) {
    throw { status: 400, message: "roomId, date, timeIn and duration are required." };
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw { status: 400, message: "Duration must be greater than 0." };
  }
  // The public/online path keeps the original whole-hour, 1-5hr rule. Admin/
  // walk-in bookings (Manual Booking modal, Room Monitoring) may use much
  // finer durations — down to a second — so staff can manage a session by
  // hours, minutes, and seconds; capped at 24h just to keep things sane.
  if (!isAdminBooking && (duration < MIN_ONLINE_DURATION_HOURS || duration > MAX_ONLINE_DURATION_HOURS)) {
    throw { status: 400, message: `Duration must be between ${MIN_ONLINE_DURATION_HOURS} and ${MAX_ONLINE_DURATION_HOURS} hours.` };
  }
  if (isAdminBooking && duration > 24) {
    throw { status: 400, message: "Duration cannot exceed 24 hours." };
  }

  const room = await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Selected room does not exist." };

  // Facility must actually be bookable — mirrors what the room card already
  // shows the guest ("Under Maintenance"/"Inactive" rooms have no Select
  // Room button), but re-checked here in case of a stale page or a direct
  // API call, so the room's own status can never be bypassed.
  if (!isAdminBooking && room.status && room.status !== "Available") {
    throw { status: 409, message: `This facility is currently ${room.status.toLowerCase()} and cannot be booked.` };
  }

  let unitPrice = room.price;
  if (room.variants && room.variants.length) {
    if (variantLabel) {
      const variant = room.variants.find(v => v.label === variantLabel);
      if (!variant) throw { status: 400, message: "Selected pricing option not found." };
      unitPrice = variant.price;
    } else {
      // No specific pricing tier was chosen — this is normal for admin/walk-in
      // bookings (Manual Booking modal, Room Monitoring) which don't expose a
      // variant picker at all. Rather than failing the booking outright,
      // default to the cheapest configured tier for this room.
      unitPrice = Math.min(...room.variants.map(v => Number(v.price) || 0));
    }
  }
  if (!Number.isFinite(unitPrice)) {
    throw { status: 400, message: "Could not determine price for this room/option." };
  }

  // Pax / room-capacity validation. room.capacity of 0 (unset) means "no
  // limit enforced" so rooms created before this field existed keep working.
  if (guestCount !== undefined && guestCount !== null && Number(room.capacity) > 0) {
    const pax = Number(guestCount);
    if (!Number.isFinite(pax) || pax < 1) {
      throw { status: 400, message: "Number of guests (pax) must be at least 1." };
    }
    if (pax > room.capacity) {
      throw { status: 400, message: `This room accommodates up to ${room.capacity} guest(s). Please reduce your pax or choose a bigger room.` };
    }
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
    throw { status: 409, message: "That time slot was just taken. Please pick another." };
  }

  const amount = unitPrice * duration;

  // Holiday/closure and operating-day enforcement — only for the online
  // customer path. Walk-in bookings taken by staff on-site are allowed to
  // proceed regardless.
  if (!isAdminBooking) {
    const settings = await Settings.getSingleton();
    const isHoliday = (settings.holidays || []).some(h => h.date === date && h.fullDay);
    const oh = settings.operatingHours || {};
    const openDays = oh.openDays;
    const [yy, mm, dd] = String(date).split("-").map(Number);
    const dayOfWeek = new Date(yy, (mm || 1) - 1, dd || 1).getDay();
    const isClosedDay = Array.isArray(openDays) && openDays.length > 0 && !openDays.includes(dayOfWeek);

    if (isHoliday || isClosedDay) {
      throw { status: 409, message: "We're closed on the selected date. Please choose another day." };
    }

    const parseHour = (str, fallback) => {
      const h = parseInt(String(str || "").split(":")[0], 10);
      return Number.isFinite(h) ? h : fallback;
    };
    const openHour = parseHour(oh.openTime, 0);
    let closeHour = parseHour(oh.closeTime, 24);
    if (closeHour <= openHour) closeHour += 24; // "00:00" close = midnight/end-of-day
    const endHour = startHour + duration;
    if (startHour < openHour || endHour > closeHour) {
      throw { status: 409, message: "That time is outside our operating hours. Please choose another slot." };
    }

    const cutoffHours = Number(oh.bookingCutoffHours) || 0;
    if (cutoffHours > 0) {
      const slotStart = new Date(yy, (mm || 1) - 1, dd || 1, startHour, 0, 0, 0);
      const hoursUntilSlot = (slotStart.getTime() - Date.now()) / 3600000;
      if (hoursUntilSlot < cutoffHours) {
        throw { status: 409, message: `Bookings must be made at least ${cutoffHours} hour(s) in advance. Please choose a later slot.` };
      }
    }
  }

  return { room, amount, unitPrice };
}

// First 3 letters of the facility name, uppercased — e.g. "Billiards" -> "BIL".
// Non-letter characters are stripped first; padded with "X" on the rare
// facility name shorter than 3 letters.
function facilityPrefix(facilityName) {
  const letters = String(facilityName || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "GEN").padEnd(3, "X");
}

// Next reservation code for today, for this facility: PPP-YYMMDD-NNNNN.
// The running number resets daily per facility — counts existing codes
// sharing today's prefix and takes the next slot. The rare race between
// this count and the actual insert is handled by saveWithReservationCode's
// retry-on-duplicate-key loop below, so no separate counters collection is
// needed.
async function nextReservationCode(facilityName) {
  const prefix = facilityPrefix(facilityName);
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const codePrefix = `${prefix}-${yy}${mm}${dd}-`;

  const count = await Booking.countDocuments({ reservationCode: { $regex: `^${codePrefix}` } });
  const seq = String(count + 1).padStart(5, "0");
  return `${codePrefix}${seq}`;
}

// Saves a newly-constructed Booking with a generated reservationCode,
// retrying with the next sequence number if a race produced a duplicate
// (reservationCode has a unique index) — single source of truth so both
// booking-creation routes (paymongoRoutes.js and bookingRoutes.js) share
// the same generation + retry logic instead of duplicating it.
async function saveWithReservationCode(booking, facilityName, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    booking.reservationCode = await nextReservationCode(facilityName);
    try {
      await booking.save();
      return booking;
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.reservationCode && i < attempts - 1) {
        continue; // another request took this sequence number first — try the next one
      }
      throw err;
    }
  }
}

// Idempotently creates the Booking for a PayMongo Payment Intent that has
// already been confirmed as paid. Called from three places that can each
// discover a successful payment first — the attach response, the status
// poll (popup/redirect fallback), and the webhook — so this is written to
// be safe no matter which one gets there first: it checks for an existing
// Booking on this paymongoPaymentIntentId before doing anything, and the
// model's unique index on that field catches the rare remaining race.
//
// Runs the Availability Safety Check (re-validates the room/date/time slot
// is still free) before creating anything. If another confirmed reservation
// has since taken it, no Booking or Reservation Code is created even though
// payment already succeeded — the caller must surface this to the guest/
// admin. Refunding isn't handled here; there's no refund call wired up in
// utils/paymongo.js yet (see PROJECT_PROGRESS.md).
async function finalizeBookingFromPayment({ paymentIntentId, metadata, paidPaymentId }) {
  const existing = await Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
  if (existing) return existing;

  const { roomId, variantLabel, date, timeIn, duration, guestCount } = metadata || {};
  let room;
  try {
    ({ room } = await validateAndPriceBooking({
      roomId,
      variantLabel: variantLabel || undefined,
      date,
      timeIn,
      duration: Number(duration),
      isAdminBooking: false,
      guestCount: Number(guestCount),
    }));
  } catch (e) {
    const err = new Error(e.message || "This time slot is no longer available.");
    err.status = e.status || 409;
    err.slotUnavailable = true;
    throw err;
  }

  const booking = new Booking({
    guestName: metadata.guestName,
    guestContact: metadata.guestContact || "",
    guestEmail: metadata.guestEmail || "",
    guestCount: Number(guestCount) || 1,
    specialRequests: metadata.specialRequests || "",
    room: room._id,
    roomLabel: room.roomNumber || room.name,
    variantLabel: variantLabel || null,
    date,
    timeIn,
    duration: Number(duration),
    amount: Number(metadata.amount),
    paymentMethod: "PayMongo",
    paymentProvider: "paymongo",
    bookedBy: metadata.bookedBy || undefined,
    source: "online",
    status: "Confirmed",
    paymentStatus: "Paid",
    downPayment: Number(metadata.downPayment) || 0,
    paymongoPaymentIntentId: paymentIntentId,
    paymongoPaymentId: paidPaymentId || "",
  });

  try {
    await saveWithReservationCode(booking, room.name);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.paymongoPaymentIntentId) {
      // Lost the race — attach/poll/webhook already created it. Return that.
      return Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
    }
    throw err;
  }
  return booking;
}

module.exports = {
  validateAndPriceBooking,
  computeDownPayment,
  saveWithReservationCode,
  finalizeBookingFromPayment,
  MIN_ONLINE_DURATION_HOURS,
  MAX_ONLINE_DURATION_HOURS,
};