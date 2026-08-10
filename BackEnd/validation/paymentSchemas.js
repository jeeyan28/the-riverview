const { Joi } = require("../middleware/validate");
const { PAYMONGO_ALLOWED_METHODS } = require("../utils/paymongo");

const objectId = Joi.string().hex().length(24);
const dateStr = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = Joi.string().pattern(/^\d{2}:\d{2}$/);

const createIntentSchema = Joi.object({
  guestName: Joi.string().trim().min(1).max(120).required(),
  guestContact: Joi.string().trim().allow("").max(120),
  guestEmail: Joi.string().trim().allow("").max(120),
  guestCount: Joi.number().integer().min(1).max(100),
  specialRequests: Joi.string().trim().allow("").max(500),
  roomId: objectId.required(),
  variantLabel: Joi.string().allow("", null),
  date: dateStr.required(),
  timeIn: timeStr.required(),
  duration: Joi.number().positive().required(),
  downPaymentHours: Joi.number().integer().min(1),
});

const attachIntentSchema = Joi.object({
  paymentMethodId: Joi.string().trim().max(120),
  paymentMethodType: Joi.string()
    .valid(...PAYMONGO_ALLOWED_METHODS)
    .when("paymentMethodId", { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
});

module.exports = { createIntentSchema, attachIntentSchema };