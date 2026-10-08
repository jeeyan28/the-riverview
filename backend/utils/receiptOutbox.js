const mongoose = require("mongoose");
const { createHash, randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const ReceiptJob = require("../model/receiptJob");
const { MAX_ATTEMPTS, LEASE_MS } = ReceiptJob;
const { sendReceiptEmail } = require("./mailer");
const { EMAIL_RE } = require("./constants");
const AppError = require("./appError");

const SNAPSHOT_FIELDS = [
  "reservationCode", "guestName", "guestContact", "guestEmail", "guestCount",
  "roomLabel", "variantLabel", "date", "timeIn", "duration", "amount",
  "paidAmount", "downPayment", "paymentChoice", "eligibleDiscount", "createdAt",
];

function receiptSnapshot(booking) {
  return Object.fromEntries(SNAPSHOT_FIELDS.filter(key => booking[key] !== undefined).map(key => [key, booking[key]]));
}

function validNow(now) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new AppError(400, "A valid receipt processing time is required.");
  return date;
}

async function queueReceipt(booking, { session, version = 1, now = new Date() } = {}) {
  if (!mongoose.isObjectIdOrHexString(booking?._id) || !booking.reservationCode || !Number.isSafeInteger(version) || version < 1) {
    throw new AppError(400, "A saved reservation and receipt version are required.");
  }
  const at = validNow(now);
  const source = typeof booking.toObject === "function" ? booking.toObject() : booking;
  const snapshot = receiptSnapshot(source);
  const guestEmail = String(source.guestEmail || "").trim();
  const venueEmail = String(process.env.GMAIL_USER || "").trim();
  const recipient = EMAIL_RE.test(guestEmail) ? guestEmail : EMAIL_RE.test(venueEmail) ? venueEmail : "";
  const key = `${booking._id}:receipt:${version}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return ReceiptJob.findOneAndUpdate({ key }, { $setOnInsert: {
    key, booking: booking._id, version, reservationCode: booking.reservationCode,
    recipient, snapshot, messageId: `<riverview-receipt-${hash}@riverview.invalid>`,
    state: recipient ? "pending" : "attention", attempts: 0, totalAttempts: 0, retryCount: 0,
    nextAttemptAt: at, leaseToken: null, leaseExpiresAt: null, sentAt: null,
    lastError: recipient ? "" : "A valid receipt email is missing. Update the reservation email and prepare a new receipt version.",
    lastErrorCode: recipient ? "" : "MISSING_RECIPIENT",
    history: [{ action: "queued", at }],
    createdAt: at,
  } }, { upsert: true, returnDocument: "after", runValidators: true, session });
}

function dueFilter(at) {
  return { $or: [
    { state: "pending", nextAttemptAt: { $lte: at } },
    { state: "sending", leaseExpiresAt: { $lte: at } },
  ] };
}

function safeErrorCode(error) {
  const code = error?.code || error?.name;
  return typeof code === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(code) ? code : "SMTP_FAILURE";
}

async function sendWithDeadline(send, job, remainingMs) {
  if (remainingMs <= 0) {
    const error = new Error("Receipt delivery deadline reached.");
    error.code = "RECEIPT_TIMEOUT";
    throw error;
  }
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => send(job.snapshot, { messageId: job.messageId, recipient: job.recipient })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Receipt delivery deadline reached.");
          error.code = "RECEIPT_TIMEOUT";
          reject(error);
        }, Math.max(1, Math.ceil(remainingMs)));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function deliverReceipts({ limit = 10, now = new Date(), send = sendReceiptEmail, deadlineMs = 20000 } = {}) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 25 || !Number.isFinite(deadlineMs) || deadlineMs < 1 || deadlineMs > 55000 || typeof send !== "function") {
    throw new AppError(400, "Choose a valid receipt batch size and processing deadline.");
  }
  const initialTime = validNow(now).getTime();
  const started = performance.now();
  const currentTime = () => new Date(initialTime + Math.max(0, Math.floor(performance.now() - started)));
  const remainingTime = () => deadlineMs - (performance.now() - started);
  const result = { processed: 0, sent: 0, pending: 0, attention: 0, timedOut: 0 };
  for (let index = 0; index < limit && remainingTime() > 0; index++) {
    const at = currentTime();
    const exhausted = await ReceiptJob.findOneAndUpdate({ ...dueFilter(at), attempts: { $gte: MAX_ATTEMPTS } }, {
      $set: {
        state: "attention", leaseToken: null, leaseExpiresAt: null,
        lastError: "Automatic receipt delivery stopped after five attempts. The reservation receipt is still available in your account.",
        lastErrorCode: "ATTEMPTS_EXHAUSTED",
      },
      $push: { history: { action: "lease_expired", at } },
    }, { returnDocument: "after", sort: { createdAt: 1 }, runValidators: true });
    if (exhausted) {
      result.attention++;
      continue;
    }
    if (remainingTime() <= 0) break;
    const leaseToken = randomUUID();
    const claimTime = currentTime();
    const job = await ReceiptJob.findOneAndUpdate({ ...dueFilter(claimTime), attempts: { $lt: MAX_ATTEMPTS } }, {
      $set: { state: "sending", leaseToken, leaseExpiresAt: new Date(claimTime.getTime() + LEASE_MS) },
      $inc: { attempts: 1, totalAttempts: 1 },
      $push: { history: { action: "sending", at: claimTime } },
    }, { returnDocument: "after", sort: { createdAt: 1 }, runValidators: true });
    if (!job) break;
    result.processed++;
    try {
      await sendWithDeadline(send, job, remainingTime());
    } catch (error) {
      const failedAt = currentTime();
      const fence = { _id: job._id, state: "sending", leaseToken, leaseExpiresAt: { $gt: failedAt } };
      if (error.code === "RECEIPT_TIMEOUT") {
        await ReceiptJob.updateOne(fence, {
          $set: { lastError: "Receipt delivery is still uncertain. We will check it after the delivery lease expires.", lastErrorCode: "RECEIPT_TIMEOUT" },
          $push: { history: { action: "timeout", at: failedAt } },
        }, { runValidators: true });
        result.timedOut++;
        break;
      }
      const state = job.attempts >= MAX_ATTEMPTS ? "attention" : "pending";
      const delay = Math.min(3600000, 60000 * 2 ** Math.max(0, job.attempts - 1));
      const updated = await ReceiptJob.updateOne(fence, {
        $set: {
          state, leaseToken: null, leaseExpiresAt: null,
          nextAttemptAt: new Date(failedAt.getTime() + delay),
          lastError: state === "attention" ? "Automatic receipt delivery stopped after five attempts. The reservation receipt is still available in your account." : "Receipt email could not be sent. We will retry it.",
          lastErrorCode: safeErrorCode(error),
        },
        $push: { history: { action: "failed", at: failedAt } },
      }, { runValidators: true });
      if (updated.modifiedCount) result[state]++;
      continue;
    }
    const completedAt = currentTime();
    const updated = await ReceiptJob.updateOne({ _id: job._id, state: "sending", leaseToken, leaseExpiresAt: { $gt: completedAt } }, {
      $set: { state: "sent", sentAt: completedAt, leaseToken: null, leaseExpiresAt: null, lastError: "", lastErrorCode: "" },
      $push: { history: { action: "sent", at: completedAt } },
    }, { runValidators: true });
    if (updated.modifiedCount) result.sent++;
  }
  return result;
}

module.exports = { queueReceipt, deliverReceipts };
