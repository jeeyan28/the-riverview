const { randomUUID } = require("node:crypto");
const Booking = require("../model/booking");
const AppError = require("./appError");
const { runInTransaction } = require("./bookingHelper");
const { financialFields, bookingCollected, money, reviewCancellationFields } = require("./bookingLifecycle");
const { CLOSABLE_STATUSES, AUTOMATIC_REFUND_STATUSES, isClosurePending, outstandingClosureRefund, canRetryUnsubmittedRefund } = require("./closurePolicy");
const { notifyReservation } = require("./reservationNotifications");
const providers = { paymongo: require("./paymongo"), xendit: require("./xendit") };

function queueClosureRefund(booking, reviewer, now = new Date()) {
  if (booking.closureRefund && booking.venueClosure?.status === "refund_requested") return false;
  if (!isClosurePending(booking)) throw new AppError(409, "This reservation has no unresolved venue closure.");
  if (!CLOSABLE_STATUSES.includes(booking.status)) throw new AppError(409, "This reservation has already started or is closed.");
  const amount = outstandingClosureRefund(booking);
  const provider = booking.paymentProvider || "manual";
  const source = booking.toObject ? booking.toObject() : booking;
  // Venue-caused cancellations always return the full amount collected.
  Object.assign(booking, reviewCancellationFields({ ...source, status: "Confirmed" }, {
    decision: "approve", cancellationSource: "admin", refundException: true,
    note: `Venue closure: ${booking.venueClosure.name} (${booking.venueClosure.date})`,
  }, reviewer, now));
  booking.venueClosure.status = "refund_requested";
  booking.venueClosure.resolvedAt = now;
  booking.closureRefund = {
    requestId: `rv-closure-${randomUUID()}`, provider,
    status: amount === 0 ? "completed" : provider === "manual" ? "manual_required" : "queued",
    amount, baseRefundedAmount: Number(booking.refundedAmount || 0), gatewayAmount: 0, processedAmount: 0,
    requestedAt: now, nextCheckAt: now, ...(amount === 0 ? { completedAt: now } : {}),
  };
  return true;
}

function normalizeRefund(provider, response, job) {
  const resource = provider === "paymongo" ? response?.data : response;
  const attrs = provider === "paymongo" ? resource?.attributes : resource;
  const amount = provider === "paymongo" ? Number(attrs?.amount) / 100 : Number(attrs?.amount);
  const matchesRequest = provider === "paymongo"
    ? attrs?.metadata?.riverview_refund_request === job.requestId || attrs?.notes === `Riverview venue closure ${job.requestId}`
    : attrs?.reference_id === job.requestId;
  const matchesPayment = provider === "paymongo" ? attrs?.payment_id === job.paymentId : attrs?.payment_request_id === job.paymentRequestId;
  if (!resource?.id || !matchesRequest || !matchesPayment || attrs?.currency !== "PHP" || !Number.isFinite(amount) || money(amount) !== money(job.gatewayAmount) || amount <= 0 || (job.providerRefundId && resource.id !== job.providerRefundId)) {
    throw new Error("Provider refund does not match the reservation, payment, request and amount.");
  }
  const status = String(attrs.status || "").toLowerCase();
  if (!["pending", "processing", "succeeded", "failed", "cancelled"].includes(status)) throw new Error("Unrecognized provider refund status.");
  return { id: resource.id, status };
}

async function applyVerifiedRefund(bookingId, response, provider) {
  return runInTransaction(async session => {
    const booking = await Booking.findById(bookingId).session(session);
    const job = booking?.closureRefund;
    if (!job || job.provider !== provider || job.status === "completed") return booking;
    const verified = normalizeRefund(provider, response, job);
    if (job.processedAmount > 0 && verified.status !== "succeeded") return booking;
    job.providerRefundId = verified.id;
    job.checkedAt = new Date();
    job.nextCheckAt = new Date(Date.now() + 60000);
    job.lastError = "";
    if (verified.status === "succeeded") {
      const desired = money(job.baseRefundedAmount + job.gatewayAmount);
      if (desired > bookingCollected(booking)) throw new Error("Refund exceeds the amount received.");
      Object.assign(booking, financialFields(booking.amount, bookingCollected(booking), Math.max(Number(booking.refundedAmount || 0), desired)));
      booking.paymentUpdatedAt = new Date();
      job.processedAmount = job.gatewayAmount;
      job.status = outstandingClosureRefund(booking) === 0 ? "completed" : "manual_required";
      if (job.status === "completed") job.completedAt = new Date();
      await booking.save({ session });
      await notifyReservation(booking, job.status === "completed" ? "refund_completed" : "refund_attention", { session });
    } else if (["failed", "cancelled"].includes(verified.status)) {
      job.status = "failed";
      job.lastError = "The provider confirmed the refund failed. Staff must arrange the full refund.";
      await booking.save({ session });
      await notifyReservation(booking, "refund_attention", { session });
    } else {
      job.status = "processing";
      await booking.save({ session });
    }
    return booking;
  });
}

async function markRefundAttention(id, requestId, status, message) {
  return runInTransaction(async session => {
    const booking = await Booking.findById(id).session(session);
    if (!booking || booking.closureRefund?.requestId !== requestId || !AUTOMATIC_REFUND_STATUSES.includes(booking.closureRefund.status)) return booking;
    booking.closureRefund.status = status;
    booking.closureRefund.lastError = message;
    booking.closureRefund.nextCheckAt = new Date(Date.now() + 300000);
    await booking.save({ session });
    await notifyReservation(booking, "refund_attention", { session });
    return booking;
  });
}

async function processClosureRefund(id, { force = false, refundId } = {}) {
  let booking = await Booking.findById(id);
  if (!booking?.closureRefund || !AUTOMATIC_REFUND_STATUSES.includes(booking.closureRefund.status)) return booking;
  const provider = providers[booking.closureRefund.provider];
  if (!provider) return booking;
  const initial = booking.closureRefund;
  if (initial.status === "submitting" && initial.nextCheckAt && new Date(initial.nextCheckAt).getTime() > Date.now() && !refundId) return booking;
  if (!force && initial.nextCheckAt && new Date(initial.nextCheckAt).getTime() > Date.now()) return booking;

  if (initial.status !== "queued" || refundId) {
    try {
      let response;
      if (refundId || initial.providerRefundId) response = await provider.retrieveRefund(refundId || initial.providerRefundId);
      else if (initial.paymentId) {
        const history = await provider.listRefunds(initial.provider === "paymongo" ? initial.paymentId : initial.paymentRequestId);
        const match = history.find(item => initial.provider === "paymongo"
          ? item.attributes?.metadata?.riverview_refund_request === initial.requestId || item.attributes?.notes === `Riverview venue closure ${initial.requestId}`
          : item.reference_id === initial.requestId);
        if (match) response = initial.provider === "paymongo" ? { data: match } : match;
      }
      if (response) return await applyVerifiedRefund(id, response, initial.provider);
      // An interrupted POST is never repeated. Even an empty provider list
      // cannot prove a timed-out request was not accepted.
      return await markRefundAttention(id, initial.requestId, "review_required", "Refund submission could not be confirmed. Check the provider dashboard before issuing another refund.");
    } catch (error) {
      console.error(`Refund reconciliation ${id} failed:`, error.status || error.name);
      await Booking.updateOne({ _id: id, "closureRefund.requestId": initial.requestId, "closureRefund.status": { $in: AUTOMATIC_REFUND_STATUSES } }, { $set: { "closureRefund.nextCheckAt": new Date(Date.now() + 300000) } });
      return Booking.findById(id);
    }
  }

  // Atomic claim across HTTP retries, scheduler runs and multiple instances.
  booking = await Booking.findOneAndUpdate({ _id: id, "closureRefund.requestId": initial.requestId, "closureRefund.status": "queued" }, { $set: {
    "closureRefund.status": "submitting", "closureRefund.submittedAt": new Date(), "closureRefund.nextCheckAt": new Date(Date.now() + 120000),
  }, $inc: { "closureRefund.attempts": 1 } }, { returnDocument: "after", runValidators: true });
  if (!booking) return Booking.findById(id);
  const job = booking.closureRefund;
  let posted = false;
  try {
    const payment = await provider.getRefundPayment(booking);
    const history = await provider.listRefunds(job.provider === "paymongo" ? payment.paymentId : payment.paymentRequestId);
    const providerRefunded = money(history.reduce((sum, item) => {
      const attrs = job.provider === "paymongo" ? item.attributes : item;
      return ["pending", "processing", "succeeded"].includes(String(attrs?.status).toLowerCase()) ? sum + Number(attrs.amount) / (job.provider === "paymongo" ? 100 : 1) : sum;
    }, 0));
    if (!Number.isFinite(providerRefunded) || providerRefunded > job.baseRefundedAmount) throw new Error("Earlier provider refunds need reconciliation with the reservation ledger.");
    const gatewayAmount = money(Math.min(job.amount, Math.max(0, payment.amount - job.baseRefundedAmount)));
    if (gatewayAmount <= 0) return await markRefundAttention(id, job.requestId, "manual_required", "No remaining online payment can be refunded automatically. Staff must return the remaining payment.");
    const prepared = await Booking.updateOne({ _id: id, "closureRefund.requestId": job.requestId, "closureRefund.status": "submitting" }, { $set: {
      "closureRefund.gatewayAmount": gatewayAmount, "closureRefund.paymentId": payment.paymentId,
      ...(payment.paymentRequestId ? { "closureRefund.paymentRequestId": payment.paymentRequestId } : {}),
    } });
    if (!prepared.matchedCount) return Booking.findById(id);
    posted = true;
    const response = await provider.createRefund({ ...payment, amount: gatewayAmount, requestId: job.requestId });
    return await applyVerifiedRefund(id, response, job.provider);
  } catch (error) {
    console.error(`Refund submission ${id} failed:`, error.status || error.name);
    if (!posted && Number(job.attempts || 0) < 3 && ([500, 502, 503, 504].includes(error.status) || ["TypeError", "AbortError"].includes(error.name))) {
      await Booking.updateOne({ _id: id, "closureRefund.requestId": job.requestId, "closureRefund.status": "submitting" }, { $set: { "closureRefund.status": "queued", "closureRefund.nextCheckAt": new Date(Date.now() + 60000) } });
      return Booking.findById(id);
    }
    // A positive provider rejection is safe for staff intervention. Network
    // timeouts, 409 duplicates and server errors require read reconciliation.
    const rejected = posted && [400, 401, 403, 404, 422].includes(error.status);
    const ambiguous = posted && !rejected;
    return markRefundAttention(id, job.requestId, ambiguous ? "review_required" : "manual_required", ambiguous
      ? "Refund submission could not be confirmed. Check the provider dashboard before issuing another refund."
      : "Automatic refund is unavailable. Staff must verify and return the remaining payment.");
  }
}

async function completeManualClosureRefund(booking, session) {
  if (!booking.closureRefund || AUTOMATIC_REFUND_STATUSES.includes(booking.closureRefund.status) || outstandingClosureRefund(booking) > 0 || booking.closureRefund.status === "completed") return;
  booking.closureRefund.status = "completed";
  booking.closureRefund.completedAt = new Date();
  await booking.save({ session });
  await notifyReservation(booking, "refund_completed", { session });
}

async function retryUnsubmittedClosureRefund(id) {
  await runInTransaction(async session => {
    const booking = await Booking.findById(id).session(session);
    if (!booking) throw new AppError(404, "Reservation not found.");
    if (!canRetryUnsubmittedRefund(booking)) throw new AppError(409, "This refund cannot be safely resubmitted. Check the provider status before returning any additional payment.");
    booking.closureRefund.status = "queued";
    booking.closureRefund.lastError = "";
    booking.closureRefund.nextCheckAt = new Date();
    await booking.save({ session });
  });
  return processClosureRefund(id);
}

async function processPendingClosureRefunds({ limit = 5 } = {}) {
  const due = await Booking.find({ "closureRefund.status": { $in: AUTOMATIC_REFUND_STATUSES }, "closureRefund.nextCheckAt": { $lte: new Date() } }).select("_id").limit(limit);
  await Promise.all(due.map(booking => processClosureRefund(booking._id)));
  return due.length;
}

async function handleRefundWebhook(provider, resource) {
  const attrs = provider === "paymongo" ? resource?.attributes : resource;
  const requestId = provider === "paymongo" ? attrs?.metadata?.riverview_refund_request : attrs?.reference_id;
  const paymentId = provider === "paymongo" ? attrs?.payment_id || (resource?.type === "payment" ? resource.id : "") : attrs?.payment_id;
  const clauses = [];
  if (resource?.id) clauses.push({ "closureRefund.providerRefundId": resource.id });
  if (requestId) clauses.push({ "closureRefund.requestId": requestId });
  if (paymentId) clauses.push({ "closureRefund.paymentId": paymentId });
  if (!clauses.length) return;
  const booking = await Booking.findOne({ "closureRefund.provider": provider, $or: clauses });
  if (!booking) return;
  const isRefund = provider === "xendit" || resource?.type === "refund";
  await processClosureRefund(booking._id, { force: true, ...(isRefund ? { refundId: resource.id } : {}) });
}

module.exports = { queueClosureRefund, normalizeRefund, applyVerifiedRefund, processClosureRefund, retryUnsubmittedClosureRefund, processPendingClosureRefunds, completeManualClosureRefund, handleRefundWebhook };
