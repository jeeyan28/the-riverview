const mongoose = require("mongoose");

const xenditPaymentAttemptSchema = new mongoose.Schema({
  referenceId: { type: String, required: true, unique: true },
  sessionId: { type: String, required: true, unique: true },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true, min: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("XenditPaymentAttempt", xenditPaymentAttemptSchema);
