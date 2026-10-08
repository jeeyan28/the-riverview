const { randomUUID } = require("node:crypto");
const Booking = require("../model/booking");
const PaymentAttempt = require("../model/paymentAttempt");
const AppError = require("./appError");
const { runInTransaction } = require("./bookingHelper");
const { financialFields, bookingCollected, money, reviewCancellationFields } = require("./bookingLifecycle");
const { CLOSABLE_STATUSES, AUTOMATIC_REFUND_STATUSES, isClosurePending, outstandingClosureRefund, canRetryUnsubmittedRefund } = require("./closurePolicy");
const { notifyReservation } = require("./reservationNotifications");
const providers = { paymongo: require("./paymongo"), xendit: require("./xendit") };
const SUBMISSION_LEASE_MS = 120000;

function refundModel(kind) {
  if (kind === "booking") return Booking;
  if (kind === "attempt") return PaymentAttempt;
  throw new AppError(400, "Invalid refund record type.");
}

function refundRecord(id, kind, session) {
  let query = refundModel(kind).findById(id);
  if (kind === "attempt") query = query.select("+metadata");
  return session ? query.session(session) : query;
}

function verifiedAttemptPayment(attempt) {
  const received = Number(attempt.receivedMinor);
  const refunded = Number(attempt.refundedMinor || 0);
  if (attempt.state !== "paid" || !attempt.verifiedAt || attempt.currency !== "PHP" || !attempt.providerId || !attempt.paymentId
    || !Number.isSafeInteger(received) || received <= 0 || received !== Number(attempt.expectedMinor)
    || !Number.isSafeInteger(refunded) || refunded < 0 || refunded > received
    || Math.round(Number(attempt.metadata?.downPayment) * 100) !== received) {
    throw new AppError(409, "The original payment must be verified before a refund can be submitted.");
  }
  return {
    downPayment: received / 100,
    paymongoPaymentIntentId: attempt.providerId, paymongoPaymentId: attempt.paymentId,
    xenditPaymentSessionId: attempt.providerId, xenditPaymentId: attempt.paymentId,
  };
}

function refundEvent(record, kind, action, { actor, note, evidence } = {}) {
  if (kind !== "attempt") return;
  record.events.push({ action, actor: actor?._id || actor || record.closureRefund?.requestedBy, note, evidence });
}

function ownsSubmission(job, { submissionToken, requireLease = false } = {}) {
  return !submissionToken || (job.submissionToken === submissionToken && job.status === "submitting"
    && (!requireLease || new Date(job.leaseExpiresAt).getTime() > Date.now()));
}

function submissionFilter(id, job) {
  return {
    _id: id, "closureRefund.requestId": job.requestId, "closureRefund.status": "submitting",
    "closureRefund.submissionToken": job.submissionToken, "closureRefund.leaseExpiresAt": { $gt: new Date() },
  };
}

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

async function applyVerifiedRefund(bookingId, response, provider, { kind = "booking", requestId, actor } = {}) {
  return runInTransaction(async session => {
    const booking = await refundRecord(bookingId, kind, session);
    const job = booking?.closureRefund;
    if (!job || job.provider !== provider || job.status === "completed" || (requestId && job.requestId !== requestId)) return booking;
    const verified = normalizeRefund(provider, response, job);
    if (job.processedAmount > 0 && verified.status !== "succeeded") return booking;
    const previousStatus = job.status;
    const previousProcessed = Number(job.processedAmount || 0);
    job.providerRefundId = verified.id;
    job.checkedAt = new Date();
    job.nextCheckAt = new Date(Date.now() + 60000);
    job.lastError = "";
    job.leaseExpiresAt = undefined;
    if (verified.status === "succeeded") {
      const desired = money(job.baseRefundedAmount + job.gatewayAmount);
      if (kind === "attempt") {
        const desiredMinor = Math.round(desired * 100);
        if (!Number.isSafeInteger(desiredMinor) || !Number.isSafeInteger(booking.receivedMinor) || desiredMinor > booking.receivedMinor) {
          throw new Error("Refund exceeds the amount received.");
        }
        booking.refundedMinor = Math.max(Number(booking.refundedMinor || 0), desiredMinor);
        job.status = booking.refundedMinor === booking.receivedMinor ? "completed" : "manual_required";
        booking.resolution = job.status === "completed" ? "refunded" : "open";
        booking.issue = job.status === "completed" ? "paid_unbooked" : "refund_attention";
      } else {
        if (desired > bookingCollected(booking)) throw new Error("Refund exceeds the amount received.");
        Object.assign(booking, financialFields(booking.amount, bookingCollected(booking), Math.max(Number(booking.refundedAmount || 0), desired)));
        booking.paymentUpdatedAt = new Date();
        job.status = outstandingClosureRefund(booking) === 0 ? "completed" : "manual_required";
      }
      job.processedAmount = job.gatewayAmount;
      if (job.status === "completed") job.completedAt = new Date();
      if (previousStatus !== job.status || previousProcessed !== Number(job.processedAmount)) {
        refundEvent(booking, kind, job.status === "completed" ? "refund_completed" : "refund_attention", { actor, evidence: verified.id });
      }
      await booking.save({ session });
      if (kind === "booking") await notifyReservation(booking, job.status === "completed" ? "refund_completed" : "refund_attention", { session });
    } else if (["failed", "cancelled"].includes(verified.status)) {
      job.status = "failed";
      job.lastError = "The provider confirmed the refund failed. Staff must arrange the full refund.";
      if (kind === "attempt") booking.issue = "refund_attention";
      if (previousStatus !== job.status) refundEvent(booking, kind, "refund_failed", { actor, note: job.lastError, evidence: verified.id });
      await booking.save({ session });
      if (kind === "booking") await notifyReservation(booking, "refund_attention", { session });
    } else {
      job.status = "processing";
      if (previousStatus !== job.status) refundEvent(booking, kind, "refund_processing", { actor, evidence: verified.id });
      await booking.save({ session });
    }
    return booking;
  });
}

async function markRefundAttention(id, requestId, status, message, { kind = "booking", actor, submissionToken, requireLease } = {}) {
  return runInTransaction(async session => {
    const booking = await refundRecord(id, kind, session);
    if (!booking || booking.closureRefund?.requestId !== requestId || !AUTOMATIC_REFUND_STATUSES.includes(booking.closureRefund.status)
      || !ownsSubmission(booking.closureRefund, { submissionToken, requireLease })) return booking;
    const changed = booking.closureRefund.status !== status || booking.closureRefund.lastError !== message;
    booking.closureRefund.status = status;
    booking.closureRefund.lastError = message;
    booking.closureRefund.nextCheckAt = new Date(Date.now() + 300000);
    booking.closureRefund.leaseExpiresAt = undefined;
    if (kind === "attempt") booking.issue = "refund_attention";
    if (changed) refundEvent(booking, kind, "refund_attention", { actor, note: message });
    await booking.save({ session });
    if (kind === "booking") await notifyReservation(booking, "refund_attention", { session });
    return booking;
  });
}

async function processClosureRefund(id, { force = false, refundId, kind = "booking", actor, readOnly = false } = {}) {
  const Model = refundModel(kind);
  let booking = await refundRecord(id, kind);
  if (!booking?.closureRefund || (!AUTOMATIC_REFUND_STATUSES.includes(booking.closureRefund.status) && !refundId)) return booking;
  const provider = providers[booking.closureRefund.provider];
  if (!provider) return booking;
  const initial = booking.closureRefund;
  if (readOnly && !refundId && (initial.status === 'queued' || initial.status === 'submitting' && !initial.submissionStartedAt)) return booking;
  const leaseEnd = initial.leaseExpiresAt || initial.nextCheckAt;
  if (initial.status === "submitting" && leaseEnd && new Date(leaseEnd).getTime() > Date.now() && !refundId) return booking;
  if (!force && initial.nextCheckAt && new Date(initial.nextCheckAt).getTime() > Date.now()) return booking;

  if (initial.status === "submitting" && initial.submissionToken && !initial.submissionStartedAt && !refundId
    && new Date(initial.leaseExpiresAt).getTime() <= Date.now()) {
    if (Number(initial.attempts || 0) >= 3) {
      return markRefundAttention(id, initial.requestId, "manual_required", "Refund verification could not finish. Staff must check the original payment.", {
        kind, actor, submissionToken: initial.submissionToken,
      });
    }
    const recovered = await Model.updateOne({
      _id: id, "closureRefund.requestId": initial.requestId, "closureRefund.status": "submitting",
      "closureRefund.submissionToken": initial.submissionToken, "closureRefund.leaseExpiresAt": { $lte: new Date() },
      "closureRefund.submissionStartedAt": null,
    }, { $set: { "closureRefund.status": "queued", "closureRefund.nextCheckAt": new Date() } });
    if (!recovered.matchedCount) return refundRecord(id, kind);
    return processClosureRefund(id, { force, kind, actor });
  }

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
      if (response) return await applyVerifiedRefund(id, response, initial.provider, { kind, actor, requestId: initial.requestId });
      // uncertain submission
      return await markRefundAttention(id, initial.requestId, "review_required", "Refund submission could not be confirmed. Check the provider dashboard before issuing another refund.", { kind, actor });
    } catch (error) {
      console.error(`Refund reconciliation ${id} failed:`, error.status || error.name);
      await Model.updateOne({ _id: id, "closureRefund.requestId": initial.requestId, "closureRefund.status": initial.status }, { $set: { "closureRefund.nextCheckAt": new Date(Date.now() + 300000) } });
      return refundRecord(id, kind);
    }
  }

  // submission claim
  const submissionToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + SUBMISSION_LEASE_MS);
  const claimUpdate = { $set: {
    "closureRefund.status": "submitting", "closureRefund.submittedAt": new Date(), "closureRefund.nextCheckAt": leaseExpiresAt,
    "closureRefund.submissionToken": submissionToken, "closureRefund.leaseExpiresAt": leaseExpiresAt,
  }, $inc: { "closureRefund.attempts": 1 } };
  if (kind === "attempt") claimUpdate.$push = { events: { action: "refund_verification_started", actor: actor?._id || actor || initial.requestedBy } };
  booking = await Model.findOneAndUpdate({
    _id: id, "closureRefund.requestId": initial.requestId, "closureRefund.status": "queued", "closureRefund.submissionStartedAt": null,
  }, claimUpdate, { returnDocument: "after", runValidators: true });
  if (!booking) return refundRecord(id, kind);
  if (kind === "attempt") booking = await refundRecord(id, kind);
  const job = booking.closureRefund;
  if (job.submissionToken !== submissionToken) return booking;
  const claim = { requestId: initial.requestId, submissionToken };
  let posted = false;
  try {
    const payment = await provider.getRefundPayment(kind === "attempt" ? verifiedAttemptPayment(booking) : booking);
    const history = await provider.listRefunds(job.provider === "paymongo" ? payment.paymentId : payment.paymentRequestId);
    const providerRefunded = money(history.reduce((sum, item) => {
      const attrs = job.provider === "paymongo" ? item.attributes : item;
      return ["pending", "processing", "succeeded"].includes(String(attrs?.status).toLowerCase()) ? sum + Number(attrs.amount) / (job.provider === "paymongo" ? 100 : 1) : sum;
    }, 0));
    if (!Number.isFinite(providerRefunded) || providerRefunded > job.baseRefundedAmount) throw new Error("Earlier provider refunds need reconciliation with the reservation ledger.");
    const gatewayAmount = money(Math.min(job.amount, Math.max(0, payment.amount - job.baseRefundedAmount)));
    if (gatewayAmount <= 0) return await markRefundAttention(id, job.requestId, "manual_required", "No remaining online payment can be refunded automatically. Staff must return the remaining payment.", {
      kind, actor, submissionToken, requireLease: true,
    });
    const preparedUpdate = { $set: {
      "closureRefund.gatewayAmount": gatewayAmount, "closureRefund.paymentId": payment.paymentId,
      ...(payment.paymentRequestId ? { "closureRefund.paymentRequestId": payment.paymentRequestId } : {}),
      "closureRefund.submissionStartedAt": new Date(),
      "closureRefund.leaseExpiresAt": new Date(Date.now() + SUBMISSION_LEASE_MS),
      "closureRefund.nextCheckAt": new Date(Date.now() + SUBMISSION_LEASE_MS),
    } };
    if (kind === "attempt") preparedUpdate.$push = { events: { action: "refund_submission_started", actor: actor?._id || actor || job.requestedBy } };
    const prepared = await Model.updateOne({ ...submissionFilter(id, claim), "closureRefund.submissionStartedAt": null }, preparedUpdate);
    if (!prepared.matchedCount) return refundRecord(id, kind);
    posted = true;
    const response = await provider.createRefund({ ...payment, amount: gatewayAmount, requestId: job.requestId });
    return await applyVerifiedRefund(id, response, job.provider, { kind, actor, requestId: job.requestId });
  } catch (error) {
    console.error(`Refund submission ${id} failed:`, error.status || error.name);
    if (!posted && Number(job.attempts || 0) < 3 && ([500, 502, 503, 504].includes(error.status) || ["TypeError", "AbortError"].includes(error.name))) {
      await Model.updateOne({ ...submissionFilter(id, claim), "closureRefund.submissionStartedAt": null }, { $set: { "closureRefund.status": "queued", "closureRefund.nextCheckAt": new Date(Date.now() + 60000) } });
      return refundRecord(id, kind);
    }
    // provider rejection
    const rejected = posted && [400, 401, 403, 404, 422].includes(error.status);
    const ambiguous = posted && !rejected;
    return markRefundAttention(id, job.requestId, ambiguous ? "review_required" : "manual_required", ambiguous
      ? "Refund submission could not be confirmed. Check the provider dashboard before issuing another refund."
      : "Automatic refund is unavailable. Staff must verify and return the remaining payment.", {
        kind, actor, submissionToken, requireLease: !posted,
      });
  }
}

async function completeManualClosureRefund(booking, session) {
  if (!booking.closureRefund || AUTOMATIC_REFUND_STATUSES.includes(booking.closureRefund.status) || outstandingClosureRefund(booking) > 0 || booking.closureRefund.status === "completed") return;
  booking.closureRefund.status = "completed";
  booking.closureRefund.completedAt = new Date();
  await booking.save({ session });
  await notifyReservation(booking, "refund_completed", { session });
}

function canRetryAttemptRefund(attempt) {
  return Boolean(attempt && !attempt.booking && attempt.state === 'paid' && attempt.resolution === 'open' && canRetryUnsubmittedRefund({
    venueClosure: { status: 'refund_requested' }, closureRefund: attempt.closureRefund,
    paidAmount: Number(attempt.receivedMinor) / 100, refundedAmount: Number(attempt.refundedMinor || 0) / 100,
  }));
}

async function retryUnsubmittedClosureRefund(id, { kind = 'booking', actor } = {}) {
  await runInTransaction(async session => {
    const booking = await refundRecord(id, kind, session);
    if (!booking) throw new AppError(404, "Reservation not found.");
    if (!(kind === 'attempt' ? canRetryAttemptRefund(booking) : canRetryUnsubmittedRefund(booking))) throw new AppError(409, "This refund cannot be safely resubmitted. Check the provider status before returning any additional payment.");
    booking.closureRefund.status = "queued";
    booking.closureRefund.lastError = "";
    booking.closureRefund.nextCheckAt = new Date();
    if (kind === 'attempt') { booking.issue = 'paid_unbooked'; refundEvent(booking, kind, 'refund_preflight_retried', { actor }); }
    await booking.save({ session });
  });
  return processClosureRefund(id, { kind, actor });
}

async function processPendingClosureRefunds({ limit = 5 } = {}) {
  const batchLimit = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 5)));
  const filter = { "closureRefund.status": { $in: AUTOMATIC_REFUND_STATUSES }, "closureRefund.nextCheckAt": { $lte: new Date() } };
  const groups = await Promise.all(["booking", "attempt"].map(async kind => {
    const records = await refundModel(kind).find(filter).select("_id closureRefund.nextCheckAt").sort({ "closureRefund.nextCheckAt": 1 }).limit(batchLimit);
    return records.map(record => ({ id: record._id, kind, dueAt: new Date(record.closureRefund.nextCheckAt).getTime() }));
  }));
  const due = groups.flat().sort((left, right) => left.dueAt - right.dueAt).slice(0, batchLimit);
  await Promise.all(due.map(record => processClosureRefund(record.id, { kind: record.kind })));
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
  if (provider === "xendit" && attrs?.payment_request_id) clauses.push({ "closureRefund.paymentRequestId": attrs.payment_request_id });
  if (!clauses.length) return;
  const isRefund = provider === "xendit" || resource?.type === "refund";
  for (const kind of ["booking", "attempt"]) {
    const record = await refundModel(kind).findOne({ "closureRefund.provider": provider, $or: clauses });
    if (record) await processClosureRefund(record._id, { kind, force: true, ...(isRefund ? { refundId: resource.id } : {}) });
  }
}

module.exports = { queueClosureRefund, normalizeRefund, applyVerifiedRefund, processClosureRefund, retryUnsubmittedClosureRefund, processPendingClosureRefunds, completeManualClosureRefund, handleRefundWebhook };
