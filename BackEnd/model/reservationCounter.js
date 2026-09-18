const mongoose = require("mongoose");

const reservationCounterSchema = new mongoose.Schema({
  _id:        { type: String, required: true },
  seq:        { type: Number, default: 0, min: 0 },
  createdAt:  { type: Date, default: Date.now },
});

reservationCounterSchema.statics.nextSequence = async function (key, session) {
  const query = this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  );
  const doc = await query;
  return doc.seq;
};

module.exports = mongoose.model("ReservationCounter", reservationCounterSchema);
