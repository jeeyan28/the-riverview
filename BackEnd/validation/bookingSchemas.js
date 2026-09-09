const { Joi } = require("../middleware/validate");
const Booking = require("../model/booking");

const objectId = Joi.string().hex().length(24);
const dateStr = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = Joi.string().pattern(/^(?:[01]\d|2[0-3]):00$/);
const duration = Joi.number().integer().min(1).max(5);
const bookingIdParamsSchema = Joi.object({ id: objectId.required() });
const emptyBodySchema = Joi.object({}).default({});

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
  hasCorkage: Joi.boolean().default(false),
  specialRequests: Joi.string().trim().allow("").max(500),
  roomId: objectId.required(),
  variantLabel: Joi.string().allow("", null),
  date: dateStr.required(),
  timeIn: timeStr.required(),
  duration: duration.required(),
  paymentMethod: Joi.string().trim().max(60).allow(""),
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
  guestEmail: Joi.string().trim().allow("").max(120),
  guestContact: Joi.string().trim().allow("").max(120),
  guestCount: Joi.number().integer().min(1).max(100),
  hasCorkage: Joi.boolean(),
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
  note: Joi.string().trim().allow("").max(500),
});

module.exports = {
  bookingIdParamsSchema,
  emptyBodySchema,
  lockSchema,
  createBookingSchema,
  rescheduleSchema,
  updateBookingSchema,
  cancellationRequestSchema,
  cancellationReviewSchema,
};
