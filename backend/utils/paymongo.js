const crypto = require("crypto");
const { fetchJson } = require('./http');
const PAYMONGO_API_BASE = process.env.PAYMONGO_API_BASE || "https://api.paymongo.com/v1";
const PAYMONGO_ALLOWED_METHODS = ["card", "gcash", "paymaya", "qrph"];
const PAYMONGO_PAYMENT_METHOD_LABELS = Object.freeze({
  card: "Credit / Debit Card",
  gcash: "GCash",
  paymaya: "Maya",
  qrph: "QR Ph",
});
const PAYMONGO_STATEMENT_DESCRIPTOR_MAX_LENGTH = 22;

function paymentFailureText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(paymentFailureText).filter(Boolean).join(" ");
  if (typeof value !== "object") return String(value);
  return [
    value.code,
    value.failed_code,
    value.failed_message,
    value.message,
    value.detail,
    value.sub_code,
  ].filter(Boolean).join(" ");
}

function classifyPaymongoPaymentFailure(value) {
  const text = paymentFailureText(value).toLowerCase();
  if (!text) return null;

  if (/expir|session[_\s-]?timeout/.test(text)) {
    return {
      status: "expired",
      message: "This payment session expired before it was completed. No charge was made. Start a new payment to continue.",
    };
  }

  if (/cancel|cancell|abandon|closed by (?:the )?(?:customer|user)/.test(text)) {
    return {
      status: "cancelled",
      message: "This payment was cancelled. No charge was made. Choose a payment method to try again.",
    };
  }

  return null;
}

function getPaymentIntentFailure(intentAttrs) {
  if (!intentAttrs) return null;

  const directFailure = classifyPaymongoPaymentFailure(intentAttrs.status);
  if (directFailure) return directFailure;

  if (intentAttrs.status === "failed") {
    return {
      status: "failed",
      message: "The payment could not be completed. No charge was made. Try another payment method.",
    };
  }

  if (intentAttrs.status !== "awaiting_payment_method" || !intentAttrs.last_payment_error) {
    return null;
  }

  return classifyPaymongoPaymentFailure(intentAttrs.last_payment_error) || {
    status: "failed",
    message: "The payment could not be completed. No charge was made. Try another payment method.",
  };
}

function normalizePaymongoPaymentMethodType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const aliases = { maya: "paymaya", qr_ph: "qrph" };
  const canonical = aliases[normalized] || normalized;
  return PAYMONGO_ALLOWED_METHODS.includes(canonical) ? canonical : "";
}

function resolvePaymongoPaymentMethodType(payment, fallback = "") {
  const attributes = payment?.attributes || {};
  const candidates = [
    attributes.source?.type,
    attributes.payment_method?.type,
    attributes.payment_method_type,
    fallback,
  ];
  for (const candidate of candidates) {
    const type = normalizePaymongoPaymentMethodType(candidate);
    if (type) return type;
  }
  return "";
}

function getPaymongoPaymentMethodLabel(type) {
  return PAYMONGO_PAYMENT_METHOD_LABELS[normalizePaymongoPaymentMethodType(type)] || "Online payment";
}

function getSecretKey() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    throw new Error(
      "PAYMONGO_SECRET_KEY is not set. Sign up at https://dashboard.paymongo.com/signup, " +
      "copy your test secret key from Developers > API Keys, and add it to your .env."
    );
  }
  return key;
}

function getPublicKey() {
  const key = process.env.PAYMONGO_PUBLIC_KEY;
  if (!key) {
    throw new Error(
      "PAYMONGO_PUBLIC_KEY is not set. Copy your test publishable key from " +
      "Developers > API Keys in the PayMongo Dashboard and add it to your .env."
    );
  }
  return key;
}

function authHeader() {
  const token = Buffer.from(`${getSecretKey()}:`).toString("base64");
  return `Basic ${token}`;
}

const GATEWAY_ERROR_STATUSES = [502, 503, 504];

async function paymongoRequestOnce(path, { method, body, timeoutMs }) {
  const { response: res, data: json, rawText } = await fetchJson(`${PAYMONGO_API_BASE}${path}`, {
    method, timeoutMs,
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || res.statusText;
    const err = new Error(`PayMongo API error: ${detail}`);
    err.status = res.status;
    err.paymongoErrors = json?.errors;
    err.rawBody = rawText;
    throw err;
  }
  return json;
}

async function paymongoRequest(path, { method = "GET", body, timeoutMs = 15000, retries = ["GET", "HEAD"].includes(method) ? 1 : 0 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await paymongoRequestOnce(path, { method, body, timeoutMs });
    } catch (err) {
      const isRetryable = err.isTimeout || GATEWAY_ERROR_STATUSES.includes(err.status) || err.name === "TypeError";
      if (!isRetryable || attempt >= retries) throw err;
      attempt += 1;
      const backoffMs = 500 * attempt;
      console.warn(`PayMongo request to ${path} failed (${err.message}) — retrying in ${backoffMs}ms (attempt ${attempt}/${retries})`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

function sanitizeStatementDescriptor(value) {
  const trimmed = (value || "").toString().trim();
  const isNumericOnly = /^\d+$/.test(trimmed);
  const safe = !trimmed ? "Booking" : isNumericOnly ? `Room ${trimmed}` : trimmed;
  return safe.slice(0, PAYMONGO_STATEMENT_DESCRIPTOR_MAX_LENGTH);
}

async function createPaymentIntent({ amountPesos, description, statementDescriptor, metadata }) {
  const payload = {
    data: {
      attributes: {
        amount: Math.round(amountPesos * 100),
        currency: "PHP",
        capture_type: "automatic",
        payment_method_allowed: PAYMONGO_ALLOWED_METHODS,
        payment_method_options: { card: { request_three_d_secure: "automatic" } },
        description: description || "Booking down payment",
        statement_descriptor: sanitizeStatementDescriptor(statementDescriptor),
        metadata: metadata || undefined,
      },
    },
  };
  return paymongoRequest("/payment_intents", { method: "POST", body: payload });
}

async function retrievePaymentIntent(paymentIntentId) {
  return paymongoRequest(`/payment_intents/${paymentIntentId}`);
}

async function getRefundPayment(booking) {
  const intent = await retrievePaymentIntent(booking.paymongoPaymentIntentId);
  if (intent?.data?.id !== booking.paymongoPaymentIntentId) throw new Error("Payment intent mismatch.");
  const paid = intent.data.attributes.payments?.find(p => p?.attributes?.status === "paid" && (!booking.paymongoPaymentId || p.id === booking.paymongoPaymentId));
  if (!paid?.id) throw new Error("No verified payment found for this reservation.");
  const payment = await paymongoRequest(`/payments/${encodeURIComponent(paid.id)}`);
  const attrs = payment?.data?.attributes;
  if (payment?.data?.id !== paid.id || attrs?.currency !== "PHP" || attrs?.status !== "paid" || Math.round(Number(attrs.amount)) !== Math.round(Number(booking.downPayment) * 100)) {
    throw new Error("Original payment does not match this reservation.");
  }
  return { paymentId: paid.id, amount: Number(attrs.amount) / 100 };
}

async function listRefunds(paymentId) {
  const results = [];
  let after;
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({ payment_id: paymentId, limit: "100", ...(after ? { after } : {}) });
    const json = await paymongoRequest(`/refunds?${query}`);
    if (!Array.isArray(json.data)) throw new Error("Invalid refund list.");
    if (json.data.some(item => !item.id || item.attributes?.payment_id !== paymentId)) throw new Error("Refund history does not match the original payment.");
    results.push(...json.data);
    if (!json.has_more) return results;
    after = json.data.at(-1)?.id;
    if (!after) break;
  }
  throw new Error("Refund history requires staff reconciliation.");
}

async function createRefund({ paymentId, amount, requestId }) {
  // Retrying an ambiguous POST can return the same money twice. Reconcile
  // through the persisted request metadata and provider reads instead.
  return paymongoRequest("/refunds", { method: "POST", retries: 0, body: { data: { attributes: {
    payment_id: paymentId, amount: Math.round(amount * 100), reason: "others",
    notes: `Riverview venue closure ${requestId}`, metadata: { riverview_refund_request: requestId },
  } } } });
}

async function retrieveRefund(id) {
  return paymongoRequest(`/refunds/${encodeURIComponent(id)}`);
}

async function createWalletPaymentMethod({ type, billing }) {
  if (!["gcash", "paymaya", "qrph"].includes(type)) {
    throw new Error(`createWalletPaymentMethod does not support type "${type}".`);
  }
  const payload = {
    data: {
      attributes: {
        type,
        billing: billing ? { name: billing.name || undefined, email: billing.email || undefined } : undefined,
      },
    },
  };
  return paymongoRequest("/payment_methods", { method: "POST", body: payload });
}

async function attachPaymentIntent({ paymentIntentId, paymentMethodId, clientKey, returnUrl }) {
  const payload = {
    data: {
      attributes: {
        payment_method: paymentMethodId,
        client_key: clientKey,
        return_url: returnUrl,
      },
    },
  };
  return paymongoRequest(`/payment_intents/${paymentIntentId}/attach`, { method: "POST", body: payload });
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("PAYMONGO_WEBHOOK_SECRET is not set — cannot verify webhook authenticity.");
  }
  if (!signatureHeader) {
    throw new Error("Missing Paymongo-Signature header.");
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
  );
  const timestamp = parts.t;
  const candidateSignature = parts.te || parts.li;
  if (!timestamp || !candidateSignature) {
    throw new Error("Malformed Paymongo-Signature header.");
  }
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new Error('Webhook request timestamp is outside the five-minute acceptance window.');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(candidateSignature, "utf8");
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) {
    throw new Error("Webhook signature verification failed.");
  }
  return true;
}

module.exports = {
  PAYMONGO_API_BASE,
  PAYMONGO_ALLOWED_METHODS,
  PAYMONGO_PAYMENT_METHOD_LABELS,
  normalizePaymongoPaymentMethodType,
  resolvePaymongoPaymentMethodType,
  getPaymongoPaymentMethodLabel,
  classifyPaymongoPaymentFailure,
  getPaymentIntentFailure,
  getPublicKey,
  createPaymentIntent,
  retrievePaymentIntent,
  getRefundPayment,
  listRefunds,
  createRefund,
  retrieveRefund,
  createWalletPaymentMethod,
  attachPaymentIntent,
  verifyWebhookSignature,
};
