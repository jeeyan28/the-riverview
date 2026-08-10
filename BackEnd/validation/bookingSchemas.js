const { Joi } = require("../middleware/validate");
const Booking = require("../model/booking");

const objectId = Joi.string().hex().length(24);
const dateStr = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = Joi.string().pattern(/^\d{2}:\d{2}$/);
const duration = Joi.number().min(Booking.MIN_DURATION_HOURS).max(Booking.MAX_DURATION_HOURS);

const lockSchema = Joi.object({
  roomId: objectId.required(),
  variantLabel: Joi.string().allow("", null),
  date: dateStr.required(),
  timeIn: timeStr.required(),
  duration: duration.required(),
});

const createBookingSchema = Joi.object({
  guestName: Joi.string().trim().min(1).max(120).required(),
  guestContact: Joi.string().trim().allow("").max(120),
  guestEmail: Joi.string().trim().allow("").max(120),
  guestCount: Joi.number().integer().min(1).max(100),
  specialRequests: Joi.string().trim().allow("").max(500),
  roomId: objectId.required(),
  variantLabel: Joi.string().allow("", null),
  date: dateStr.required(),
  timeIn: timeStr.required(),
  duration: duration.required(),
  paymentMethod: Joi.string().trim().max(60).allow(""),
  status: Joi.string().valid(...Object.values(Booking.BOOKING_STATUS)),
});

const rescheduleSchema = Joi.object({
  date: dateStr.required(),
  timeIn: timeStr.required(),
});

const updateBookingSchema = Joi.object({
  status: Joi.string().valid(...Object.values(Booking.BOOKING_STATUS)),
  duration,
  paymentMethod: Joi.string().trim().max(60).allow(""),
  timeIn: timeStr,
  date: dateStr,
  guestName: Joi.string().trim().min(1).max(120),
  guestEmail: Joi.string().trim().allow("").max(120),
  guestContact: Joi.string().trim().allow("").max(120),
  guestCount: Joi.number().integer().min(1).max(100),
  amount: Joi.number().min(0),
  downPayment: Joi.number().min(0),
  paymentStatus: Joi.string().valid(...Object.values(Booking.PAYMENT_STATUS)),
  specialRequests: Joi.string().trim().allow("").max(500),
  room: objectId,
  variantLabel: Joi.string().allow("", null),
}).min(1);

module.exports = { lockSchema, createBookingSchema, rescheduleSchema, updateBookingSchema };