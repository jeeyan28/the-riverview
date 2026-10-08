const { Joi } = require("../middleware/validate");
const { PAYMONGO_ALLOWED_METHODS } = require("../utils/paymongo");
const { validDateKey } = require("../utils/businessDate");

const objectId = Joi.string().hex().length(24);
const dateStr = Joi.string().custom((value, helpers) => validDateKey(value) ? value : helpers.message('Choose a valid date in YYYY-MM-DD format.'));
const timeStr = Joi.string().pattern(/^(?:[01]\d|2[0-3]):00$/);
const guestPhone = Joi.string().trim().min(7).max(40).pattern(/^\+?[0-9() .-]+$/)
  .custom((value, helpers) => value.replace(/\D/g, '').length >= 7 ? value : helpers.message('Phone number must contain at least 7 digits.'));
const guestEmail = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254);
const paymentIntentIdParamsSchema = Joi.object({
  paymentIntentId: Joi.string().trim().pattern(/^pi_[A-Za-z0-9_-]+$/).max(120).required(),
});

const createIntentSchema = Joi.object({
  attemptKey: Joi.string().guid({ version: ['uuidv4'] }),
  guestName: Joi.string().trim().min(1).max(120).required(),
  guestContact: guestPhone.required(),
  guestEmail: guestEmail.required(),
  guestCount: Joi.number().integer().min(1).max(100),
  specialRequests: Joi.string().trim().allow("").max(500),
  roomId: objectId.required(),
  variantLabel: Joi.string().allow("", null),
  date: dateStr.required(),
  timeIn: timeStr.required(),
  duration: Joi.number().integer().min(1).max(5).required(),
  downPaymentHours: Joi.number().integer().min(1),
  paymentChoice: Joi.string().valid("deposit", "full"),
  claimDiscount: Joi.boolean().default(false),
  selectedAddOns: Joi.array().items(Joi.string().trim().min(1).max(80)).unique().max(10).default([]),
});

const attachIntentSchema = Joi.object({
  paymentMethodId: Joi.string().trim().max(120),
  paymentMethodType: Joi.string()
    .valid(...PAYMONGO_ALLOWED_METHODS)
    .when("paymentMethodId", { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
});

module.exports = { paymentIntentIdParamsSchema, createIntentSchema, attachIntentSchema };
