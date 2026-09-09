const mongoose = require("mongoose");
const Room = require("../model/room");
const Booking = require("../model/booking");
const Settings = require("../model/settings");
const BookingLock = require("../model/bookingLock");
const { sendReceiptEmail } = require("./mailer");
const { TIME_ZONE } = require("./constants");
const { bookingStartMs, financialFields } = require("./bookingLifecycle");
const { calculateBookingPrice, computeDownPayment, parsePaxCapacity } = require("./roomPricing");

async function voidExpiredBookings() {
  const now = Date.now();
  const confirmed = await Booking.find({ status: Booking.BOOKING_STATUS.CONFIRMED, cancellationStatus: { $ne: "Requested" } }).select("date timeIn duration");
  const expiredIds = confirmed
    .filter((b) => {
      return bookingStartMs(b.date, b.timeIn) + Number(b.duration) * 3600000 <= now;
    })
    .map((b) => b._id);
  if (expiredIds.length) {
    await Booking.updateMany({ _id: { $in: expiredIds }, status: Booking.BOOKING_STATUS.CONFIRMED, cancellationStatus: { $ne: "Requested" } }, { status: Booking.BOOKING_STATUS.NO_SHOW, noShowAt: new Date(now) });
  }
}

async function updateBookingLifecycleStatuses() {
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

  const stale = await Booking.find({
    date: { $lt: todayKey },
    status: {
      $in: [
        Booking.BOOKING_STATUS.PENDING,
        Booking.BOOKING_STATUS.PENDING_PAYMENT_VERIFICATION,
        Booking.BOOKING_STATUS.AWAITING_ONLINE_PAYMENT,
      ],
    },
  }).select("_id");
  if (stale.length) {
    await Booking.updateMany({ _id: { $in: stale.map((b) => b._id) }, status: { $in: [Booking.BOOKING_STATUS.PENDING, Booking.BOOKING_STATUS.PENDING_PAYMENT_VERIFICATION, Booking.BOOKING_STATUS.AWAITING_ONLINE_PAYMENT] } }, { status: Booking.BOOKING_STATUS.OVERDUE });
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

async function validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking, guestCount, hasCorkage = false, excludeLockUserId, excludeBookingId, session }) {
  if (!roomId || !date || !timeIn || !duration) {
    throw { status: 400, message: "roomId, date, timeIn and duration are required." };
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 5) {
    throw { status: 400, message: "Reservations must be 1–5 hours in whole-hour increments." };
  }
  if (!Number.isFinite(bookingStartMs(date, timeIn)) || !/:00$/.test(timeIn)) throw { status: 400, message: "Choose a valid date and an hourly start time." };
  
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

  // Serialize capacity checks for this facility inside booking transactions.
  const room = session
    ? await Room.findOneAndUpdate({ _id: roomId }, { $inc: { __v: 1 } }, { returnDocument: "after", session })
    : await Room.findById(roomId);
  if (!room) throw { status: 404, message: "Selected room does not exist." };

  let selectedVariant = null;
  if (room.variants && room.variants.length) {
    if (variantLabel) {
      selectedVariant = room.variants.find(v => v.label === variantLabel);
      if (!selectedVariant) throw { status: 400, message: "Selected pricing option not found." };
      if (!isAdminBooking && selectedVariant.status && selectedVariant.status !== "Available") {
        throw { status: 409, message: `This room is currently ${selectedVariant.status.toLowerCase()} and cannot be booked.` };
      }
    } else {
      throw { status: 400, message: "Choose a room type or pricing option." };
    }
  }

  if (guestCount !== undefined && guestCount !== null) {
    const pax = Number(guestCount);
    if (!Number.isFinite(pax) || pax < 1) {
      throw { status: 400, message: "Number of guests (pax) must be at least 1." };
    }
    const capacity = parsePaxCapacity(selectedVariant?.pax) || (Number(room.capacity) > 0 ? Number(room.capacity) : null);
    if (capacity && pax > capacity) {
      throw { status: 400, message: `This room accommodates up to ${capacity} guest(s). Please reduce your pax or choose a bigger room.` };
    }
  }

  const startHour = parseInt(String(timeIn).split(":")[0], 10);
  const capacity = getSlotCapacity(room, variantLabel);
  const query = Booking.find({
    room: room._id,
    variantLabel: variantLabel || null,
    date,
    status: { $nin: ["Cancelled", "Rejected", "No Show"] },
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

  const pricing = calculateBookingPrice({
    variant: selectedVariant,
    basePrice: room.price,
    timeIn,
    duration,
    guestCount,
    hasCorkage,
  });
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

  return { room, ...pricing };
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
      let pricing;
      try {
        pricing = await validateAndPriceBooking({
          roomId,
          variantLabel: variantLabel || undefined,
          date,
          timeIn,
          duration: Number(duration),
          isAdminBooking: false,
          guestCount: Number(guestCount),
          hasCorkage: metadata.hasCorkage === "true",
          excludeLockUserId: metadata.bookedBy || undefined,
          session,
        });
        room = pricing.room;
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
        roomCharge: Number(metadata.roomCharge) || pricing.roomCharge,
        hourlyRates: (() => {
          try {
            const rates = JSON.parse(metadata.hourlyRates || "[]");
            return Array.isArray(rates) && rates.length ? rates : pricing.hourlyRates;
          } catch {
            return pricing.hourlyRates;
          }
        })(),
        corkageFee: Number(metadata.corkageFee) || 0,
        paymentMethod: "PayMongo",
        paymentProvider: "paymongo",
        bookedBy: metadata.bookedBy || undefined,
        source: "online",
        status: "Confirmed",
        ...financialFields(Number(metadata.amount), Number(metadata.downPayment) || 0),
        paymentUpdatedAt: new Date(),
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
  updateBookingLifecycleStatuses,
};
