const Settings = require("../model/settings");
const Booking = require("../model/booking");
const { RoomSession } = require("../model/monitoring");
const AppError = require("./appError");
const { runInTransaction } = require("./bookingHelper");
const { shiftDate } = require("./bookingSchedule");
const { businessDate, validDateKey } = require("./businessDate");
const { bookingStartMs } = require("./bookingLifecycle");
const { CLOSABLE_STATUSES, isAffectedByClosure } = require("./closurePolicy");
const { customerForBooking, notifyReservation } = require("./reservationNotifications");

async function affectedReservations(date, settings, session) {
  const query = Booking.find({
    date: { $in: [date, shiftDate(date, 1)] }, status: { $in: CLOSABLE_STATUSES },
    "venueClosure.status": { $ne: "pending" },
  }).sort({ date: 1, timeIn: 1 });
  const bookings = await (session ? query.session(session) : query);
  const affected = [];
  for (const booking of bookings) {
    if (!isAffectedByClosure(booking, date, settings.operatingHours)) continue;
    const linked = RoomSession.exists({ booking: booking._id, status: { $in: ["Active", "Finished"] } });
    if (await (session ? linked.session(session) : linked)) continue;
    affected.push(booking);
  }
  return affected;
}

async function createHolidayWithClosure(payload, userId) {
  if (!validDateKey(payload.date)) throw new AppError(400, "Choose a valid closure date.");
  if (payload.date < businessDate()) throw new AppError(400, "Choose today or a future closure date.");
  return runInTransaction(async session => {
    const settings = await Settings.getSingleton({ session });
    const fullDay = payload.fullDay !== false;
    if (fullDay && settings.holidays.some(h => h.date === payload.date && h.fullDay)) throw new AppError(409, "This date is already closed.");
    settings.holidays.push({ ...payload, fullDay, note: payload.note || "" });
    settings.updatedBy = userId;
    settings.updatedAt = new Date();
    await settings.save({ session });
    const holiday = settings.holidays.at(-1);
    const bookings = fullDay ? await affectedReservations(holiday.date, settings, session) : [];
    for (const booking of bookings) {
      const recipient = await customerForBooking(booking, session);
      booking.venueClosure = {
        holidayId: holiday._id, date: holiday.date, name: holiday.name, note: holiday.note,
        customerUserId: recipient.userId, status: "pending", notifiedAt: new Date(),
      };
      // A venue closure supersedes a pending customer cancellation policy.
      if (booking.cancellationStatus === "Requested") {
        booking.cancellationStatus = "None";
        booking.cancellationSource = "admin";
        booking.cancellationRefundException = true;
      }
      await booking.save({ session });
      await notifyReservation(booking, "closure", { session });
    }
    return { ...holiday.toObject(), affectedReservationCount: bookings.length };
  });
}

async function removeHolidayWithClosure(id, userId) {
  return runInTransaction(async session => {
    const settings = await Settings.getSingleton({ session });
    const holiday = settings.holidays.id(id);
    if (!holiday) throw new AppError(404, "Holiday not found.");
    const removed = holiday.toObject();
    settings.holidays = settings.holidays.filter(h => String(h._id) !== String(id));
    settings.updatedBy = userId;
    settings.updatedAt = new Date();
    await settings.save({ session });
    const pending = await Booking.find({ "venueClosure.holidayId": id, "venueClosure.status": "pending" }).session(session);
    for (const booking of pending) {
      // Removing a past closure must not turn an innocent guest into a no-show.
      if (bookingStartMs(booking.date, booking.timeIn) <= Date.now()) continue;
      booking.venueClosure.status = "reopened";
      booking.venueClosure.resolvedAt = new Date();
      await booking.save({ session });
      await notifyReservation(booking, "reopened", { session });
    }
    return removed;
  });
}

module.exports = { affectedReservations, createHolidayWithClosure, removeHolidayWithClosure };
