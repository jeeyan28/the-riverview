const crypto = require("node:crypto");

const API_BASE = "https://api.xendit.co";
const CHANNELS = ["GCASH", "PAYMAYA"];

function isConfigured() {
  return Boolean(process.env.XENDIT_SECRET_KEY && process.env.XENDIT_WEBHOOK_TOKEN && getReturnBaseUrl());
}

function getReturnBaseUrl() {
  const value = (process.env.XENDIT_RETURN_BASE_URL || (process.env.APP_BASE_URL || "").split(",")[0] || "").trim();
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

function isPaymongoUnavailable(error) {
  return [500, 502, 503, 504].includes(error?.status) || error?.isTimeout === true || error?.name === "TypeError";
}

async function request(path, { method = "GET", body, headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `Xendit returned ${response.status}.`);
      error.status = response.status;
      error.code = data.error_code;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function safeCheckoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    return host === "xen.to" || host === "dev.xen.to" || host === "xendit.co" || host.endsWith(".xendit.co") ? url.href : "";
  } catch {
    return "";
  }
}

async function createSession({ referenceId, amount, expiresAt, description }) {
  const base = getReturnBaseUrl();
  if (!isConfigured() || !base) throw new Error("Xendit backup checkout is not configured.");
  const data = await request("/sessions", {
    method: "POST",
    body: {
      reference_id: referenceId,
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      capture_method: "AUTOMATIC",
      amount,
      currency: "PHP",
      country: "PH",
      allowed_payment_channels: CHANNELS,
      expires_at: expiresAt.toISOString(),
      description,
      success_return_url: `${base}/?xendit=success&referenceId=${encodeURIComponent(referenceId)}`,
      cancel_return_url: `${base}/?xendit=cancel&referenceId=${encodeURIComponent(referenceId)}`,
    },
  });
  const redirectUrl = safeCheckoutUrl(data.payment_link_url);
  if (!data.payment_session_id || !redirectUrl || data.reference_id !== referenceId) {
    throw new Error("Xendit did not return a valid checkout session.");
  }
  return { sessionId: data.payment_session_id, redirectUrl };
}

function verifyWebhookToken(value) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expected || typeof value !== "string") return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function getVerifiedPayment(attempt) {
  const session = await request(`/sessions/${encodeURIComponent(attempt.sessionId)}`);
  const sameSession = session.payment_session_id === attempt.sessionId && session.reference_id === attempt.referenceId;
  const sameAmount = Math.round(Number(session.amount) * 100) === Math.round(attempt.amount * 100);
  if (!sameSession || !sameAmount || session.currency !== "PHP" || session.session_type !== "PAY") {
    throw new Error("Xendit session does not match the reservation payment.");
  }
  if (session.status !== "COMPLETED" || !session.payment_id) {
    return { status: session.status === "CANCELED" ? "cancelled" : session.status === "EXPIRED" ? "expired" : "processing" };
  }
  const payment = await request(`/v3/payments/${encodeURIComponent(session.payment_id)}`);
  const samePayment = payment.payment_id === session.payment_id && payment.payment_request_id === session.payment_request_id;
  const paymentAmount = Math.round(Number(payment.request_amount) * 100) === Math.round(attempt.amount * 100);
  if (!samePayment || !paymentAmount || payment.currency !== "PHP" || payment.type !== "PAY") {
    throw new Error("Xendit payment does not match the checkout session.");
  }
  if (payment.status !== "SUCCEEDED") return { status: "processing" };
  return { status: "succeeded", paymentId: payment.payment_id, paymentMethodType: payment.channel_code };
}

async function getRefundPayment(booking) {
  if (!booking.xenditPaymentId) throw new Error("Original payment ID is missing.");
  const payment = await request(`/v3/payments/${encodeURIComponent(booking.xenditPaymentId)}`);
  const session = await request(`/sessions/${encodeURIComponent(booking.xenditPaymentSessionId)}`);
  if (payment.payment_id !== booking.xenditPaymentId || payment.payment_id !== session.payment_id || payment.payment_request_id !== session.payment_request_id || session.payment_session_id !== booking.xenditPaymentSessionId || payment.currency !== "PHP" || payment.type !== "PAY" || payment.status !== "SUCCEEDED" || Math.round(Number(payment.request_amount) * 100) !== Math.round(Number(booking.downPayment) * 100)) {
    throw new Error("Original payment does not match this reservation.");
  }
  return { paymentId: payment.payment_id, paymentRequestId: payment.payment_request_id, amount: Number(payment.request_amount) };
}

async function createRefund({ paymentRequestId, amount, requestId }) {
  return request("/refunds", { method: "POST", headers: { "idempotency-key": requestId }, body: {
    reference_id: requestId, payment_request_id: paymentRequestId,
    currency: "PHP", amount, reason: "CANCELLATION",
  } });
}

async function retrieveRefund(id) {
  return request(`/refunds/${encodeURIComponent(id)}`);
}

async function listRefunds(paymentRequestId) {
  const query = new URLSearchParams({ payment_request_id: paymentRequestId, limit: "100" });
  const result = await request(`/refunds?${query}`);
  if (!Array.isArray(result.data) || result.has_more) throw new Error("Refund history requires staff reconciliation.");
  return result.data;
}

module.exports = { createSession, getVerifiedPayment, isConfigured, isPaymongoUnavailable, verifyWebhookToken, getRefundPayment, createRefund, retrieveRefund, listRefunds };
