// Thin wrapper around the PayMongo REST API (https://api.paymongo.com) for
// the embedded online-payment flow:
//   - Card is tokenized CLIENT-SIDE (BookingModal.jsx, using PAYMONGO_PUBLIC_KEY)
//     into a Payment Method id — raw card numbers never reach this server.
//   - GCash / Maya / QRPh Payment Methods carry no sensitive data, so those
//     are created here, server-side, from just a type + billing info.
//   - Either kind of Payment Method is then attached to a Payment Intent.
//     Card may resolve immediately ("succeeded") or need a 3D Secure
//     challenge; e-wallets always need the customer to authorize in
//     PayMongo's redirect page. Both cases are surfaced as
//     `next_action.redirect.url` for the frontend to open in a popup.
//
// Requires these in .env:
//   PAYMONGO_SECRET_KEY    — starts with sk_test_... (sk_live_... in production)
//   PAYMONGO_PUBLIC_KEY    — starts with pk_test_... — safe to expose, served
//                            to the frontend via GET /api/payments/paymongo/config
//   PAYMONGO_WEBHOOK_SECRET — the "Signing secret" shown when you register the
//                             webhook endpoint in the PayMongo Dashboard

const crypto = require("crypto");

// Base URL for every server-side PayMongo call in this file. Mirrors the
// same literal hardcoded in Frontend/src/components/BookingModal.jsx for
// client-side card tokenization — keep both in sync (separate runtimes, no
// shared module possible).
const PAYMONGO_API_BASE = "https://api.paymongo.com/v1";

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
  // PayMongo uses HTTP Basic Auth with the secret key as the username and an
  // empty password. All calls in this file act on the server's behalf, so
  // they always use the secret key — never the public key.
  const token = Buffer.from(`${getSecretKey()}:`).toString("base64");
  return `Basic ${token}`;
}

async function paymongoRequest(path, { method = "GET", body } = {}) {
  const res = await fetch(`${PAYMONGO_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || res.statusText;
    const err = new Error(`PayMongo API error: ${detail}`);
    err.status = res.status;
    err.paymongoErrors = json?.errors;
    throw err;
  }
  return json;
}

// PayMongo rejects a statement_descriptor that's entirely numeric (e.g. a
// bare room number like "101"). Prefix it so it always contains at least
// one non-digit character; falls back to "Booking" if nothing usable was
// passed in.
function sanitizeStatementDescriptor(value) {
  const trimmed = (value || "").toString().trim();
  const isNumericOnly = /^\d+$/.test(trimmed);
  const safe = !trimmed ? "Booking" : isNumericOnly ? `Room ${trimmed}` : trimmed;
  return safe.slice(0, 22);
}

// Creates a Payment Intent for the booking's down payment. `amountPesos` is
// a whole peso amount — PayMongo's API wants centavos (amount * 100), same
// as Stripe's smallest-unit convention. `request_three_d_secure: "automatic"`
// lets PayMongo decide whether a card needs a 3DS challenge; when it doesn't,
// attach() below resolves straight to "succeeded" with no popup at all.
// `metadata` (optional) is an object of string values PayMongo stores on the
// intent and hands back unchanged on every later read/webhook. Used to carry
// the prospective booking's details (guest info, room/date/time, pricing)
// so the Booking itself doesn't have to exist until payment actually
// succeeds — see finalizeBookingFromPayment() in utils/bookingHelper.js.
async function createPaymentIntent({ amountPesos, description, statementDescriptor, metadata }) {
  const payload = {
    data: {
      attributes: {
        amount: Math.round(amountPesos * 100),
        currency: "PHP",
        capture_type: "automatic",
        payment_method_allowed: ["card", "gcash", "paymaya", "qrph"],
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

// Creates a Payment Method for GCash/Maya/QRPh — no card fields are ever
// accepted here, so this is safe to call with data straight from req.body.
// (Card Payment Methods are created client-side instead — see
// PAYMONGO_PUBLIC_KEY above — and only their resulting `pm_...` id is ever
// sent to this server.)
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

// Attaches a Payment Method (card, tokenized client-side, or an e-wallet
// created just above) to a Payment Intent. `clientKey` is the intent's own
// client_key (returned by createPaymentIntent and mirrored onto the booking
// so it's available here without another round trip). Resulting
// `data.attributes.status` is one of:
//   "succeeded"              — done, no popup needed (typical for card w/o 3DS)
//   "awaiting_next_action"   — open `next_action.redirect.url` in a popup
//   "processing"             — check back shortly (retrievePaymentIntent)
//   "awaiting_payment_method"— this attempt failed (e.g. card declined); the
//                              same intent can be attached again with a new method
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

// Verifies the `Paymongo-Signature` header against the raw request body.
// Header format: "t=<unix_timestamp>,te=<test_mode_signature>,li=<live_mode_signature>"
// The signature is HMAC-SHA256(webhookSecret, `${timestamp}.${rawBody}`), hex-encoded.
// We check the test-mode signature (`te`) first, falling back to live (`li`),
// so this works whether the webhook secret is a test or live one.
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
  getPublicKey,
  createPaymentIntent,
  retrievePaymentIntent,
  createWalletPaymentMethod,
  attachPaymentIntent,
  verifyWebhookSignature,
};