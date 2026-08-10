const { Joi } = require("../middleware/validate");

const dateStr = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = Joi.string().pattern(/^\d{2}:\d{2}$/);

const operatingHoursSchema = Joi.object({
  openTime: timeStr,
  closeTime: timeStr,
  openDays: Joi.array().items(Joi.number().integer().min(0).max(6)),
  minOnlineDurationHours: Joi.number().positive(),
  maxOnlineDurationHours: Joi.number().positive(),
});

const createHolidaySchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  date: dateStr.required(),
  fullDay: Joi.boolean(),
  note: Joi.string().trim().allow("").max(300),
});

const createAnnouncementSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  message: Joi.string().trim().min(1).max(1000).required(),
  emoji: Joi.string().trim().max(10).allow(""),
  isActive: Joi.boolean(),
  expiresAt: Joi.date().allow(null, ""),
});

const updateAnnouncementSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120),
  message: Joi.string().trim().min(1).max(1000),
  emoji: Joi.string().trim().max(10).allow(""),
  isActive: Joi.boolean(),
  expiresAt: Joi.date().allow(null, ""),
}).min(1);

const createPaymentMethodSchema = Joi.object({
  name: Joi.string().trim().min(1).max(60).required(),
  isActive: Joi.boolean(),
});

const updatePaymentMethodSchema = Joi.object({
  name: Joi.string().trim().min(1).max(60),
  isActive: Joi.boolean(),
});

module.exports = {
  operatingHoursSchema,
  createHolidaySchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
};