const { createHash } = require('node:crypto');
const PaymentAttempt = require('../model/paymentAttempt');
const AppError = require('./appError');

function minorUnits(pesos) {
  const value = Math.round(Number(pesos) * 100);
  if (!Number.isSafeInteger(value) || value <= 0) throw new AppError(400, 'Choose a valid payment amount.');
  return value;
}
function fingerprint(metadata) {
  return createHash('sha256').update(JSON.stringify(Object.keys(metadata).sort().map(key => [key, String(metadata[key])]))).digest('hex');
}
async function prepareAttempt({ provider, hold, user, metadata, clientKey }) {
  const fields = { provider, flowKey: String(hold._id), hold: hold._id, bookedBy: user._id, room: metadata.roomId,
    clientKey: clientKey || String(hold._id), fingerprint: fingerprint(metadata), metadata,
    expectedMinor: minorUnits(metadata.downPayment), expiresAt: hold.expiresAt,
    events: [{ action: 'checkout_prepared' }],
  };
  let attempt;
  try { attempt = await PaymentAttempt.findOneAndUpdate({ flowKey: fields.flowKey }, { $setOnInsert: fields }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }).select('+metadata'); }
  catch (error) {
    if (error.code !== 11000) throw error;
    attempt = await PaymentAttempt.findOne({ $or: [{ flowKey: fields.flowKey }, { bookedBy: user._id, clientKey: fields.clientKey }] }).select('+metadata');
  }
  if (!attempt || String(attempt.bookedBy) !== String(user._id) || attempt.fingerprint !== fields.fingerprint || attempt.flowKey !== fields.flowKey) {
    throw new AppError(409, 'Your reservation changed. Review the price and selection before checkout.');
  }
  return attempt;
}
async function markUncertain(attempt, category = 'provider_write') {
  await PaymentAttempt.updateOne({ _id: attempt._id, state: { $nin: ['paid', 'expired'] }, booking: null }, {
    $set: { state: 'uncertain', issue: 'provider_uncertain', errorCategory: category, nextCheckAt: new Date(Date.now() + 60000) },
    $push: { events: { action: 'provider_outcome_uncertain', note: 'Check the original provider before another payment.' } },
  });
}
async function importLegacyPaidIntent(id, attrs, userId) {
  const source = attrs.metadata || {}, paid = (attrs.payments || []).filter(item => item?.attributes?.status === 'paid');
  if (userId && String(source.bookedBy) !== String(userId)) throw new AppError(403, 'Not allowed.');
  if (!/^[a-f\d]{24}$/i.test(source.bookedBy || '') || !/^[a-f\d]{24}$/i.test(source.roomId || '') || attrs.currency !== 'PHP' || paid.length !== 1 ||
    paid[0].attributes.currency !== 'PHP' || Number(paid[0].attributes.amount) !== Number(attrs.amount) ||
    (paid[0].attributes.payment_intent_id && paid[0].attributes.payment_intent_id !== id) || minorUnits(source.downPayment) !== Number(attrs.amount)) return null;
  const booking = await require('../model/booking').findOne({ paymongoPaymentIntentId: id });
  if (booking && (String(booking.bookedBy) !== String(source.bookedBy) || minorUnits(booking.downPayment) !== Number(attrs.amount) || booking.paymongoPaymentId !== paid[0].id)) return null;
  const metadata = Object.fromEntries(['roomId', 'bookedBy', 'variantLabel', 'date', 'timeIn', 'duration', 'guestCount', 'amount', 'downPayment'].map(key => [key, source[key]]));
  const fields = { provider: 'paymongo', providerId: id, paymentId: paid[0].id, flowKey: `legacy-paymongo:${id}`, clientKey: `legacy-paymongo:${id}`,
    room: source.roomId, bookedBy: source.bookedBy, metadata, fingerprint: fingerprint(metadata), expectedMinor: Number(attrs.amount), receivedMinor: Number(attrs.amount),
    state: 'paid', issue: booking ? '' : 'paid_unbooked', booking: booking?._id, resolution: booking ? 'booked' : 'open', verifiedAt: new Date(), nextCheckAt: null,
    events: [{ action: booking ? 'legacy_booking_imported' : 'legacy_paid_requires_review', note: booking ? 'Existing reservation matched the retrieved provider payment.' : 'Historical provider payment has no independent current checkout snapshot. Contact the venue with the original payment reference.' }],
  };
  try { return await PaymentAttempt.findOneAndUpdate({ provider: 'paymongo', providerId: id }, { $setOnInsert: fields }, { upsert: true, returnDocument: 'after', runValidators: true }).select('+metadata'); }
  catch (error) { if (error.code !== 11000) throw error; return PaymentAttempt.findOne({ provider: 'paymongo', providerId: id }).select('+metadata'); }
}
async function verifyPaymongoIntent(intent, { userId } = {}) {
  const attrs = intent?.data?.attributes;
  const id = intent?.data?.id;
  if (!id || !attrs) throw new AppError(502, 'We could not verify the payment response.');
  let attempt = await PaymentAttempt.findOne({ provider: 'paymongo', providerId: id }).select('+metadata');
  if (!attempt && !attrs.metadata?.attemptId) attempt = await importLegacyPaidIntent(id, attrs, userId);
  if (!attempt && attrs.metadata?.attemptId) {
    attempt = await PaymentAttempt.findOne({ _id: attrs.metadata.attemptId, provider: 'paymongo' }).select('+metadata');
    if (attempt && !attempt.providerId && attrs.metadata?.attemptId === attempt._id && String(attrs.metadata?.bookedBy) === String(attempt.bookedBy) && attrs.currency === 'PHP' && Number(attrs.amount) === attempt.expectedMinor) {
      attempt = await PaymentAttempt.findOneAndUpdate({ _id: attempt._id, providerId: null }, { $set: { providerId: id } }, { returnDocument: 'after' }).select('+metadata') || await PaymentAttempt.findById(attempt._id).select('+metadata');
    }
  }
  if (!attempt) throw new AppError(409, 'This payment needs staff reconciliation.');
  if (userId && String(attempt.bookedBy) !== String(userId)) throw new AppError(403, 'Not allowed.');
  const paid = (attrs.payments || []).filter(payment => payment?.attributes?.status === 'paid');
  const legacy = attempt.flowKey === `legacy-paymongo:${id}` && !attrs.metadata?.attemptId;
  const matches = attempt.providerId === id && (legacy || attrs.metadata?.attemptId === attempt._id) &&
    String(attrs.metadata.bookedBy) === String(attempt.bookedBy) && attrs.currency === 'PHP' && Number(attrs.amount) === attempt.expectedMinor &&
    paid.length <= 1 && paid.every(payment => payment.id && payment.attributes.currency === 'PHP' && Number(payment.attributes.amount) === attempt.expectedMinor &&
      (!payment.attributes.payment_intent_id || payment.attributes.payment_intent_id === id));
  if (!matches || (attrs.status === 'succeeded' && paid.length !== 1)) {
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { issue: 'verification_mismatch', nextCheckAt: new Date(Date.now() + 300000) }, $push: { events: { action: 'verification_rejected', note: 'Provider amount, currency or association did not match.' } } });
    throw new AppError(409, 'This payment needs staff verification. Please do not pay again.');
  }
  return { attempt, paidPayment: paid[0], metadata: attempt.metadata };
}
async function recordPaidConflict(attempt, paymentId, reason) {
  await PaymentAttempt.findOneAndUpdate({ _id: attempt._id, booking: null, closureRefund: { $exists: false }, issue: { $ne: 'paid_unbooked' } }, {
    $set: { state: 'paid', issue: 'paid_unbooked', receivedMinor: attempt.expectedMinor, paymentId, verifiedAt: new Date(), errorCategory: 'reservation_conflict', nextCheckAt: null },
    $push: { events: { action: 'paid_reservation_conflict', note: String(reason).slice(0, 500) } },
  }, { returnDocument: 'after' });
  return { status: 'paid_slot_unavailable', paymentStatus: 'Paid', attemptId: attempt._id,
    message: 'Your payment was received, but the reservation could not be completed. Contact the venue with your payment reference. Please do not pay again.' };
}
async function finalizeVerifiedAttempt(attempt, { paymentId, paymentMethodType }) {
  if (attempt.closureRefund || attempt.resolution === 'refunded') return { status: attempt.resolution === 'refunded' ? 'refunded' : 'paid_slot_unavailable', paymentStatus: 'Paid', attemptId: attempt._id, message: attempt.resolution === 'refunded' ? 'Your payment was refunded. Staff recorded the verified outcome.' : 'Your payment was received, but the reservation is not confirmed. Contact the venue before making another payment.' };
  if (attempt.issue === 'paid_unbooked') return recordPaidConflict(attempt, paymentId, 'Payment received without a confirmed reservation.');
  try {
    const booking = await require('./bookingHelper').finalizeBookingFromPayment({ provider: attempt.provider, paymentIntentId: attempt.providerId,
      metadata: attempt.metadata, paidPaymentId: paymentId, paymentMethodType, attemptId: attempt._id });
    return { status: booking.status, paymentStatus: booking.paymentStatus, bookingId: booking._id, reservationCode: booking.reservationCode,
      receiptStatus: 'pending', attemptId: attempt._id };
  } catch (error) {
    if (!error.slotUnavailable) throw error;
    return recordPaidConflict(attempt, paymentId, error.message);
  }
}
module.exports = { minorUnits, fingerprint, prepareAttempt, markUncertain, verifyPaymongoIntent, recordPaidConflict, finalizeVerifiedAttempt };
