const Room = require("../model/room");
const Booking = require("../model/booking");
const Settings = require("../model/settings");

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
  if (!Number.isFinite(duration) || duration < 1 || duration > 5) {
    throw { status: 400, message: "Duration must be between 1 and 5 hours." };
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
    const variant = room.variants.find(v => v.label === variantLabel);
    if (!variant) throw { status: 400, message: "Selected pricing option not found." };
    unitPrice = variant.price;
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

module.exports = { validateAndPriceBooking, computeDownPayment };
