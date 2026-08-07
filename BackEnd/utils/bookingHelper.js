const mongoose = require("mongoose");
const Room = require("../model/room");
const Booking = require("../model/booking");
const Settings = require("../model/settings");
const BookingLock = require("../model/bookingLock");
const { sendReceiptEmail } = require("./mailer");

function computeDownPayment(unitPrice, hours = 1) {
  const price = Number(unitPrice) || 0;
  const h = Number(hours) || 1;
  return Math.max(0, Math.round(price * h));
}

function bookingStartMs(dateStr, timeIn) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const hour = parseInt(String(timeIn).split(":")[0], 10) || 0;
  return new Date(y, (m || 1) - 1, d || 1, hour).getTime();
}

async function voidExpiredBookings() {
  const now = Date.now();
  const confirmed = await Booking.find({ status: Booking.BOOKING_STATUS.CONFIRMED }).select("date timeIn downPaymentHours");
  const expiredIds = confirmed
    .filter((b) => {
      const holdHours = Math.max(1, Number(b.downPaymentHours) || 1);
      return bookingStartMs(b.date, b.timeIn) + holdHours * 3600000 < now;
    })
    .map((b) => b._id);
  if (expiredIds.length) {
    await Booking.updateMany({ _id: { $in: expiredIds } }, { status: Booking.BOOKING_STATUS.CANCELLED });
  }
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

async function validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount, excludeLockUserId, excludeBookingId, session }) {
  if (!roomId || !date || !timeIn || !duration) {
    throw { status: 400, message: "roomId, date, timeIn and duration are required." };
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw { status: 400, message: "Duration must be greater than 0." };
  }
  
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

  let unitPrice = room.price;
  if (room.variants && room.variants.length) {
    if (variantLabel) {
      const variant = room.variants.find(v => v.label === variantLabel);
      if (!variant) throw { status: 400, message: "Selected pricing option not found." };
      if (!isAdminBooking && variant.status && variant.status !== "Available") {
        throw { status: 409, message: `This room is currently ${variant.status.toLowerCase()} and cannot be booked.` };
      }
      unitPrice = variant.price;
    } else {
      unitPrice = Math.min(...room.variants.map(v => Number(v.price) || 0));
    }
  }
  if (!Number.isFinite(unitPrice)) {
    throw { status: 400, message: "Could not determine price for this room/option." };
  }

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
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
  }).select("timeIn duration");
  const existing = await (session ? query.session(session) : query);

  const lockFilter = {
    room: room._id,
    variantLabel: variantLabel || null,
    date,
    expiresAt: { $gt: new Date() },
  };
  if (excludeLockUserId) lockFilter.lockedBy = { $ne: excludeLockUserId };
  const lockQuery = BookingLock.find(lockFilter).select("timeIn duration");
  const activeLocks = await (session ? lockQuery.session(session) : lockQuery);
  const occupied = [...existing, ...activeLocks];

  const endHourExclusive = Math.ceil(startHour + duration);
  for (let hour = startHour; hour < endHourExclusive; hour++) {
    const bookedCount = occupied.filter(b => {
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
    if (closeHour <= openHour) closeHour += 24;
    const endHour = startHour + duration;
    if (startHour < openHour || endHour > closeHour) {
      throw { status: 409, message: "That time is outside our operating hours. Please choose another slot." };
    }
  }

  return { room, amount, unitPrice };
}


async function releaseLockForSlot({ roomId, variantLabel, date, timeIn, duration, lockedBy, session }) {
  const filter = {
    room: roomId,
    variantLabel: variantLabel || null,
    date,
    timeIn,
    duration: Number(duration),
    lockedBy,
  };
  const query = BookingLock.deleteOne(filter);
  return session ? query.session(session) : query;
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
        continue;
      }
      throw err;
    }
  }
}

async function finalizeBookingFromPayment({ paymentIntentId, metadata, paidPaymentId }) {
  const existing = await Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
  if (existing) return existing;

  const { roomId, variantLabel, date, timeIn, duration, guestCount } = metadata || {};

  let booking;
  try {
    booking = await runInTransaction(async (session) => {
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
          excludeLockUserId: metadata.bookedBy || undefined,
          session,
        }));
      } catch (e) {
        const err = new Error(e.message || "This time slot is no longer available.");
        err.status = e.status || 409;
        err.slotUnavailable = true;
        throw err;
      }

      const newBooking = new Booking({
        guestName: metadata.guestName,
        guestContact: metadata.guestContact || "",
        guestEmail: metadata.guestEmail || "",
        guestCount: Number(guestCount) || 1,
        specialRequests: metadata.specialRequests || "",
        room: room._id,
        roomLabel: room.name,
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
        downPaymentHours: Number(metadata.downPaymentHours) || 1,
        paymongoPaymentIntentId: paymentIntentId,
        paymongoPaymentId: paidPaymentId || "",
      });

      await saveWithReservationCode(newBooking, room.name, undefined, session);
      if (metadata.bookedBy) {
        await releaseLockForSlot({ roomId: room._id, variantLabel: variantLabel || null, date, timeIn, duration: Number(duration), lockedBy: metadata.bookedBy, session });
      }
      return newBooking;
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.paymongoPaymentIntentId) {
      return Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
    }
    throw err;
  }

  sendReceiptEmail(booking).catch((err) => {
    console.error(`Failed to send receipt email for booking ${booking.reservationCode}:`, err.message);
  });

  return booking;
}

module.exports = {
  validateAndPriceBooking,
  computeDownPayment,
  saveWithReservationCode,
  finalizeBookingFromPayment,
  getSlotCapacity,
  runInTransaction,
  releaseLockForSlot,
  bookingStartMs,
  voidExpiredBookings,
};