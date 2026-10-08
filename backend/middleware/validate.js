const Joi = require("joi");

function validate(schema, source = "body") {
  return Object.assign((req, res, next) => {
    const { error, value } = schema.validate(req[source] ?? (source === 'body' ? {} : undefined), {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
        errors: error.details.map((d) => d.message),
      });
    }
    if (source === "query") {
      Object.defineProperty(req, source, { value, writable: true, configurable: true, enumerable: true });
    } else {
      req[source] = value;
    }
    next();
  }, { apiValidation: { schema, source } });
}

module.exports = { validate, Joi };
