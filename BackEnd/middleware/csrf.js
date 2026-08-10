const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function verifyOrigin(allowedOrigins) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    if (origin) {
      if (!allowedOrigins.includes(origin)) {
        return res.status(403).json({ message: "Request origin not allowed." });
      }
      return next();
    }

    const referer = req.headers.referer;
    if (referer) {
      const refererOrigin = (() => {
        try {
          return new URL(referer).origin;
        } catch {
          return null;
        }
      })();
      if (refererOrigin && !allowedOrigins.includes(refererOrigin)) {
        return res.status(403).json({ message: "Request origin not allowed." });
      }
    }

    next();
  };
}

module.exports = { verifyOrigin };