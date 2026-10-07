const Joi = require("joi");

function validate(schema, source = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
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
  };
}

module.exports = { validate, Joi };
