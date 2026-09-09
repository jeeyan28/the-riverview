const { Joi } = require("../middleware/validate");

const objectId = Joi.string().trim().hex().length(24);
const money = Joi.number().min(0).precision(2);
const duration = Joi.number().integer().min(1).max(24);
const paymentStatus = Joi.string().valid("Paid", "Partial", "Unpaid");
const paymentTiming = Joi.string().valid("Before", "After");

const idParamsSchema = Joi.object({ id: objectId.required() });
const emptyBodySchema = Joi.object({}).default({});

const monitorRoomCreateSchema = Joi.object({
  facilityName: Joi.string().trim().min(1).max(100).required(),
  roomName: Joi.string().trim().min(1).max(100).required(),
  roomNumber: Joi.string().trim().min(1).max(40).required(),
  price: money.default(0),
  status: Joi.string().valid("Available", "Occupied", "Under Maintenance", "Inactive").default("Available"),
});

const monitorRoomUpdateSchema = Joi.object({
  facilityName: Joi.string().trim().min(1).max(100),
  roomName: Joi.string().trim().min(1).max(100),
  roomNumber: Joi.string().trim().min(1).max(40),
  price: money,
  status: Joi.string().valid("Available", "Occupied", "Under Maintenance", "Inactive"),
}).min(1);

const roomTargetSchema = Joi.object({
  facilityName: Joi.string().trim().min(1).max(100).required(),
  roomName: Joi.string().trim().min(1).max(100).required(),
  roomNumber: Joi.string().trim().min(1).max(40),
  startingRoomNumber: Joi.number().integer().min(1).allow(null),
  roomCount: Joi.number().integer().min(1).max(100).allow(null),
});

const sessionCreateSchema = Joi.object({
  roomId: objectId,
  roomTarget: roomTargetSchema,
  bookingId: objectId,
  duration: duration.required(),
  paymentMethod: Joi.string().trim().allow("").max(60),
  paymentStatus,
  paidAmount: money,
  paymentTiming,
  guestName: Joi.string().trim().allow("").max(120),
  guestCount: Joi.number().integer().min(1).max(100),
  hasCorkage: Joi.boolean().default(false),
}).or("roomId", "bookingId");

const sessionExtendSchema = Joi.object({
  addedHours: duration.required(),
  paymentStatus,
  paymentMethod: Joi.string().trim().allow("").max(60),
});

const sessionEndSchema = Joi.object({
  paid: Joi.boolean().default(false),
  paidAmount: money,
});

const sessionCorrectionSchema = Joi.object({
  amount: money,
  paidAmount: money,
  paymentStatus,
  paymentTiming,
  guestName: Joi.string().trim().allow("").max(120),
}).min(1);

const sessionCancelSchema = Joi.object({
  reason: Joi.string().trim().allow("").max(500),
}).default({});

module.exports = {
  idParamsSchema,
  emptyBodySchema,
  monitorRoomCreateSchema,
  monitorRoomUpdateSchema,
  sessionCreateSchema,
  sessionExtendSchema,
  sessionEndSchema,
  sessionCorrectionSchema,
  sessionCancelSchema,
};
