const User = require("../model/user");
const { Joi } = require("../middleware/validate");

const name = Joi.string().trim().min(3).max(100);
const password = Joi.string().min(8).max(128);

const userIdParamsSchema = Joi.object({
  id: Joi.string().trim().pattern(/^[a-f\d]{24}$/i).required(),
});

const createUserSchema = Joi.object({
  firstName: name.required(),
  lastName: name.required(),
  phone: Joi.string().trim().allow("").max(40).default(""),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).required(),
  password: password.required(),
  role: Joi.string().valid(...User.ROLES).required(),
});

const roleSchema = Joi.object({ role: Joi.string().valid(...User.ROLES).required() });
const statusSchema = Joi.object({ isActive: Joi.boolean().required() });
const profileSchema = Joi.object({
  firstName: name,
  lastName: name,
  phone: Joi.string().trim().allow("").max(40),
}).min(1);
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().allow("").max(128),
  newPassword: password.required(),
});
const emptyBodySchema = Joi.object({}).default({});

module.exports = {
  userIdParamsSchema,
  createUserSchema,
  roleSchema,
  statusSchema,
  profileSchema,
  changePasswordSchema,
  emptyBodySchema,
};
