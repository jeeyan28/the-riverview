const { Joi } = require("../middleware/validate");
const { SERVICE_NAMES } = require("../utils/roomCatalog");

const hourlyTime = Joi.string().pattern(/^(?:[01]\d|2[0-3]):00$/);
const roomIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});
const emptyBodySchema = Joi.object({}).default({});

const roomVariantSchema = Joi.object({
  label: Joi.string().trim().min(1).max(100).required(),
  price: Joi.number().min(0).precision(2).required(),
  pax: Joi.string().trim().allow("").max(80),
  startingRoomNumber: Joi.number().integer().min(1).max(99999).default(1),
  roomCount: Joi.number().integer().min(1).max(100).default(1),
  status: Joi.string().valid("Available", "Maintenance", "Unavailable").default("Available"),
  image: Joi.string().trim().allow("").max(1000),
  description: Joi.string().trim().allow("").max(500),
  features: Joi.array().items(Joi.string().trim().min(1).max(120)).max(30).default([]),
  pricingMode: Joi.string().valid("flat", "time-based").default("flat"),
  eveningPrice: Joi.when("pricingMode", {
    is: "time-based",
    then: Joi.number().min(0).precision(2).required(),
    otherwise: Joi.number().min(0).precision(2).allow(null),
  }),
  eveningStartTime: hourlyTime.default("17:00"),
  includedGuests: Joi.number().integer().min(0).max(100).default(0),
  extraGuestFee: Joi.number().min(0).precision(2).default(0),
});

const roomWriteSchema = Joi.object({
  name: Joi.string().trim().valid(...SERVICE_NAMES).required(),
  description: Joi.string().trim().allow("").max(1000).default(""),
  price: Joi.number().min(0).precision(2).default(0),
  capacity: Joi.number().integer().min(0).max(100).default(0),
  image: Joi.string().trim().allow("").max(1000),
  features: Joi.array().items(Joi.string().trim().min(1).max(120)).max(30).default([]),
  variants: Joi.array().items(roomVariantSchema).min(1).max(30).required(),
  variantImageIndexes: Joi.array().items(Joi.number().integer().min(0)).max(20).default([]),
});

module.exports = { roomIdParamsSchema, emptyBodySchema, roomWriteSchema };
