const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String,
  owner: String,
  version: { type: Number, default: 0 },
  expiresAt: { type: Date, default: () => new Date(0) },
  startedAt: Date,
  completedAt: Date,
  lastSuccessAt: Date,
  lastFailureAt: Date,
  status: { type: String, enum: ['running', 'completed', 'partial_failure'], default: 'completed' },
  counts: mongoose.Schema.Types.Mixed,
  failedStages: [String],
});
module.exports = mongoose.model('JobLease', schema);
