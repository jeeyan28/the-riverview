const { Joi } = require("../middleware/validate");
const Booking = require("../model/booking");
const { validDateKey } = require("../utils/businessDate");

const objectId = Joi.string().hex().length(24);
const dateStr = Joi.string().custom((value, helpers) => validDateKey(value) ? value : helpers.message('Choose a valid date in YYYY-MM-DD format.'));
const timeStr = Joi.string().pattern(/^(?:[01]\d|2[0-3]):00$/);
const duration = Joi.number().integer().min(1).max(5);
const guestPhone = Joi.string().trim().min(7).max(40).pattern(/^\+?[0-9() .-]+$/)
  .custom((value, helpers) => value.replace(/\D/g, '').length >= 7 ? value : helpers.message('Phone number must contain at least 7 digits.'));
const guestEmail = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254);
const bookingIdParamsSchema = Joi.object({ id: objectId.required() });
const emptyBodySchema = Joi.object({}).default({});

const availabilityQuerySchema = Joi.object({
  roomId: objectId.required(),
  date: dateStr.required(),
  variantLabel: Joi.string().trim().allow("").max(120),
});
const monthAvailabilityQuerySchema = Joi.object({
  roomId: objectId.required(),
  year: Joi.number().integer().min(1000).max(9999).required(),
  month: Joi.number().integer().min(1).max(12).required(),
  variantLabel: Joi.string().trim().allow("").max(120),
});

const lockSchema = Joi.object({
  roomId: objectId.required(),
  variantLabel: Joi.string().allow("", null),
  date: dateStr.required(),
  timeIn: timeStr.required(),
  duration: duration.required(),
});

const createBookingSchema = Joi.object({
  guestName: Joi.string().trim().min(1).max(120).required(),
  guestContact: guestPhone.required(),
  guestEmail: guestEmail.required(),
  guestCount: Joi.number().integer().min(1).max(100),
  specialRequests: Joi.string().trim().allow("").max(500),
  roomId: objectId.required(),
  variantLabel: Joi.string().allow("", null),
  date: dateStr.required(),
  timeIn: timeStr.required(),
  duration: duration.required(),
  paymentMethod: Joi.string().trim().max(60).allow(""),
  paymentChoice: Joi.string().valid("deposit", "full"),
  paidAmount: Joi.number().min(0).precision(2),
  status: Joi.string().valid("Pending", "Confirmed"),
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
  guestEmail,
  guestContact: guestPhone,
  guestCount: Joi.number().integer().min(1).max(100),
  downPayment: Joi.number().min(0),
  paymentStatus: Joi.string().valid(...Object.values(Booking.PAYMENT_STATUS)),
  paidAmount: Joi.number().min(0).precision(2),
  specialRequests: Joi.string().trim().allow("").max(500),
  room: objectId,
  variantLabel: Joi.string().allow("", null),
}).min(1);

const cancellationRequestSchema = Joi.object({ reason: Joi.string().trim().min(1).max(500).required() });
const cancellationReviewSchema = Joi.object({
  decision: Joi.string().valid("approve", "reject").required(),
  refundedAmount: Joi.number().min(0).precision(2),
  refundException: Joi.boolean(),
  note: Joi.string().trim().allow("").max(500),
});

module.exports = {
  bookingIdParamsSchema,
  availabilityQuerySchema,
  monthAvailabilityQuerySchema,
  emptyBodySchema,
  lockSchema,
  createBookingSchema,
  rescheduleSchema,
  updateBookingSchema,
  cancellationRequestSchema,
  cancellationReviewSchema,
};
