class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }

  static publicMessage(error, fallback = "Server error.") {
    const status = error?.status;
    return Number.isInteger(status) && status >= 400 && status < 500 && typeof error.message === "string"
      ? error.message
      : fallback;
  }
}

module.exports = AppError;
