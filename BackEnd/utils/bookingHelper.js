const mongoose = require("mongoose");
const Room = require("../model/room");
const Booking = require("../model/booking");
const Settings = require("../model/settings");

function computeDownPayment(unitPrice) {
  const price = Number(unitPrice) || 0;
  return Math.max(0, Math.round(price));
}

function getSlotCapacity(room, variantLabel) {
  if (room.variants && room.variants.length && variantLabel) {
    const variant = room.variants.find(v => v.label === variantLabel);
    return Math.max(1, Number(variant?.roomCount) || 1);
  }
  return 1;
}

async function runInTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    session.endSession();
  }
}

async function validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount, session }) {
  if (!roomId || !date || !timeIn || !duration) {
    throw { status: 400, message: "roomId, date, timeIn and duration are required." };
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw { status: 400, message: "Duration must be greater than 0." };
  }

  // Fetched once up front for online bookings — reused below for the
  // duration check and the holiday/operating-hours checks, so there's only
  // one Settings read per validation call.
  const settings = isAdminBooking ? null : await Settings.getSingleton();

  if (!isAdminBooking) {
    const minDuration = Number(settings?.operatingHours?.minOnlineDurationHours) || 1;
    const maxDuration = Number(settings?.operatingHours?.maxOnlineDurationHours) || 5;
    if (duration < minDuration || duration > maxDuration) {
      throw { status: 400, message: `Duration must be between ${minDuration} and ${maxDuration} hours.` };
    }
  }
  if (isAdminBooking && duration > Booking.MAX_DURATION_HOURS) {
    throw { status: 400, message: `Duration cannot exceed ${Booking.MAX_DURATION_HOURS} hours.` };
  }

  const roomQuery = Room.findById(roomId);
  const room = await (session ? roomQuery.session(session) : roomQuery);
  if (!room) throw { status: 404, message: "Selected room does not exist." };

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

  const startHour = parseInt(String(timeIn).split(":")[0], 10);
  const capacity = getSlotCapacity(room, variantLabel);
  const query = Booking.find({
    room: room._id,
    variantLabel: variantLabel || null,
    date,
    status: { $nin: ["Cancelled", "Rejected"] },
  }).select("timeIn duration");
  const existing = await (session ? query.session(session) : query);

  const endHourExclusive = Math.ceil(startHour + duration);
  for (let hour = startHour; hour < endHourExclusive; hour++) {
    const bookedCount = existing.filter(b => {
      const bStart = parseInt(String(b.timeIn).split(":")[0], 10);
      return hour >= bStart && hour < bStart + b.duration;
    }).length;
    if (bookedCount >= capacity) {
      throw { status: 409, message: "That time slot is fully booked. Please pick another." };
    }
  }

  const amount = unitPrice * duration;
  if (!isAdminBooking) {
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
  }

  return { room, amount, unitPrice };
}


function facilityPrefix(facilityName) {
  const letters = String(facilityName || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "GEN").padEnd(3, "X");
}


async function nextReservationCode(facilityName, session) {
  const prefix = facilityPrefix(facilityName);
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const codePrefix = `${prefix}-${yy}${mm}${dd}-`;

  const query = Booking.countDocuments({ reservationCode: { $regex: `^${codePrefix}` } });
  const count = await (session ? query.session(session) : query);
  const seq = String(count + 1).padStart(5, "0");
  return `${codePrefix}${seq}`;
}

async function saveWithReservationCode(booking, facilityName, attempts = 5, session) {
  for (let i = 0; i < attempts; i++) {
    booking.reservationCode = await nextReservationCode(facilityName, session);
    try {
      await booking.save(session ? { session } : undefined);
      return booking;
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.reservationCode && i < attempts - 1) {
        continue; // another request took this sequence number first — try the next one
      }
      throw err;
    }
  }
}

async function finalizeBookingFromPayment({ paymentIntentId, metadata, paidPaymentId }) {
  const existing = await Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
  if (existing) return existing;

  const { roomId, variantLabel, date, timeIn, duration, guestCount } = metadata || {};

  try {
    return await runInTransaction(async (session) => {
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
          session,
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

      await saveWithReservationCode(booking, room.name, undefined, session);
      return booking;
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.paymongoPaymentIntentId) {
      // Lost the race — attach/poll/webhook already created it. Return that.
      return Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
    }
    throw err;
  }
}

module.exports = {
  validateAndPriceBooking,
  computeDownPayment,
  saveWithReservationCode,
  finalizeBookingFromPayment,
  getSlotCapacity,
  runInTransaction,
};