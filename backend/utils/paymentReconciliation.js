const PaymentAttempt = require('../model/paymentAttempt');
const { retrievePaymentIntent, resolvePaymongoPaymentMethodType, getPaymentIntentFailure, PAYMONGO_ALLOWED_METHODS } = require('./paymongo');
const { getVerifiedPayment } = require('./xendit');
const { verifyPaymongoIntent, finalizeVerifiedAttempt } = require('./paymentAttempts');
const AppError = require('./appError');
const BookingLock = require('../model/bookingLock');
const Settings = require('../model/settings');
const { validateAndPriceBooking } = require('./bookingHelper');
const { quoteOnlineBooking } = require('./roomPricing');
const { operatingWindowForStart } = require('./bookingSchedule');

async function originalCheckout(attempt, checkout) {
  const hold = await BookingLock.findOne({ _id: attempt.hold, lockedBy: attempt.bookedBy, expiresAt: { $gt: new Date() } });
  if (!hold) return null;
  const metadata = attempt.metadata;
  const selectedAddOns = JSON.parse(metadata.addOns || '[]').map(item => item.name);
  const draft = {
    ...Object.fromEntries(['roomId', 'variantLabel', 'date', 'timeIn', 'guestName', 'guestContact', 'guestEmail', 'specialRequests', 'paymentChoice'].map(key => [key, metadata[key]])),
    duration: Number(metadata.duration), guestCount: Number(metadata.guestCount), claimDiscount: Number(metadata.discountPercent) > 0, selectedAddOns,
  };
  try {
    const { room, selectedVariant, roomCharge, hourlyRates } = await validateAndPriceBooking({ ...draft, isAdminBooking: false, excludeLockUserId: attempt.bookedBy });
    const quote = quoteOnlineBooking({ room, variant: selectedVariant, basePrice: { roomCharge, hourlyRates }, ...draft });
    if (quote.amount !== Number(metadata.amount) || quote.downPayment !== attempt.expectedMinor / 100 || JSON.stringify(hourlyRates) !== metadata.hourlyRates) return null;
    const settings = await Settings.getSingleton();
    draft.serviceDate = operatingWindowForStart(draft.date, draft.timeIn, settings.operatingHours.openTime, settings.operatingHours.closeTime).serviceDate;
    return { draft, hold: { id: hold._id, expiresAt: hold.expiresAt }, checkout: { ...checkout, attemptId: attempt._id, amount: attempt.expectedMinor / 100 } };
  } catch (error) {
    if (error.status && error.status < 500) return null;
    throw error;
  }
}

async function recheckAttempt(id, { actor, providerId, includeCheckout = false } = {}) {
  let attempt = await PaymentAttempt.findById(id).select('+metadata');
  if (!attempt) throw new AppError(404, 'Payment attempt not found.');
  const canResume = includeCheckout && String(actor?._id) === String(attempt.bookedBy);
  if (attempt.provider === 'demo') {
    if (!canResume || process.env.APP_MODE !== 'demo') throw new AppError(409, 'This is a synthetic demo record. Provider actions are disabled.');
    return { status: 'pending', attemptId: id, resume: attempt.state === 'pending' ? await originalCheckout(attempt, { gateway: 'demo' }) : null };
  }
  const reference = attempt.providerId || providerId;
  if (!reference) return { status: 'checking', attemptId: id, message: 'The original provider reference has not been recovered. Staff must check the provider dashboard; another payment is unsafe.' };
  let outcome;
  if (attempt.provider === 'paymongo') {
    if (!/^pi_[A-Za-z0-9_-]{1,116}$/.test(reference)) throw new AppError(400, 'Choose a valid provider payment intent reference.');
    const intent = await retrievePaymentIntent(reference);
    const verified = await verifyPaymongoIntent(intent);
    if (verified.attempt._id !== id) throw new AppError(409, 'That provider reference belongs to another attempt.');
    attempt = verified.attempt;
    if (verified.paidPayment) outcome = await finalizeVerifiedAttempt(attempt, { paymentId: verified.paidPayment.id, paymentMethodType: resolvePaymongoPaymentMethodType(verified.paidPayment) });
    else {
      const failure = getPaymentIntentFailure(intent.data.attributes);
      const status = failure?.status || String(intent.data.attributes.status);
      const state = ['cancelled', 'expired'].includes(status) ? 'expired' : status === 'failed' ? 'failed' : 'pending';
      await PaymentAttempt.updateOne({ _id: id, state: { $ne: 'paid' } }, { $set: { state, issue: '', nextCheckAt: new Date(Date.now() + 60000) } });
      outcome = { status, attemptId: id, paymentStatus: 'Unpaid', message: failure?.message };
      if (canResume && !failure && status === 'awaiting_payment_method' && intent.data.attributes.client_key) {
        outcome.resume = await originalCheckout(attempt, { gateway: 'paymongo', paymentIntentId: reference, clientKey: intent.data.attributes.client_key, publicKey: process.env.PAYMONGO_PUBLIC_KEY || '', paymentMethods: PAYMONGO_ALLOWED_METHODS });
      }
    }
  } else {
    const verified = await getVerifiedPayment({ referenceId: id, sessionId: reference, amount: attempt.expectedMinor / 100 });
    if (!attempt.providerId) {
      await PaymentAttempt.updateOne({ _id: id, providerId: null }, { $set: { providerId: reference } });
      attempt.providerId = reference;
    }
    outcome = verified.status === 'succeeded' ? await finalizeVerifiedAttempt(attempt, { paymentId: verified.paymentId, paymentMethodType: verified.paymentMethodType }) : { status: verified.status, paymentStatus: 'Unpaid', attemptId: id };
  }
  await PaymentAttempt.updateOne({ _id: id }, { $push: { events: { action: 'provider_status_checked', actor: actor?._id, note: outcome.status } }, $set: { nextCheckAt: new Date(Date.now() + 300000) } });
  return outcome;
}
async function reconcileDuePayments({ limit = 3 } = {}) {
  const due = await PaymentAttempt.find({ state: { $in: ['pending', 'uncertain'] }, providerId: { $exists: true }, nextCheckAt: { $lte: new Date() } }).limit(Math.min(limit, 5)).select('_id');
  let checked = 0;
  for (const attempt of due) {
    try { await recheckAttempt(attempt._id); checked++; }
    catch (error) {
      await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { nextCheckAt: new Date(Date.now() + 300000), errorCategory: 'provider_status_unavailable' } });
      if (!error.status || error.status >= 500) throw error;
    }
  }
  return { checked };
}
module.exports = { recheckAttempt, reconcileDuePayments };
