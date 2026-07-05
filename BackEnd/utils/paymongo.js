// Thin wrapper around the PayMongo REST API (https://api.paymongo.com) for
// the automatic online-payment flow. Uses the hosted "Checkout Session" —
// the simplest integration: we create a session server-side, redirect the
// customer to PayMongo's own payment page, and PayMongo tells us (via
// webhook) the moment it's paid. No card/GCash/Maya data ever touches our
// server directly.
//
// Requires these in .env (see .env.example):
//   PAYMONGO_SECRET_KEY   — starts with sk_test_... (or sk_live_... in production)
//   PAYMONGO_WEBHOOK_SECRET — the "Signing secret" shown when you register the
//                             webhook endpoint in the PayMongo Dashboard
//
// You don't have a PayMongo account yet — sign up (free) at
// https://dashboard.paymongo.com/signup, then grab your TEST secret key from
// Developers > API Keys. Test mode lets you run the whole flow with fake
// GCash/card payments before you're even verified/live.

const crypto = require("crypto");

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

function authHeader() {
  // PayMongo uses HTTP Basic Auth with the secret key as the username and an
  // empty password.
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

// Creates a Checkout Session for a single line item (the booking's down
// payment) and returns the full PayMongo response. `amountPesos` is a whole
// peso amount — PayMongo's API wants centavos (amount * 100), same as
// Stripe's smallest-unit convention.
async function createCheckoutSession({
  amountPesos,
  description,
  referenceNumber, // our own bookingId, so we can find it again from a webhook payload
  successUrl,
  cancelUrl,
  customerEmail,
  customerName,
}) {
  const payload = {
    data: {
      attributes: {
        send_email_receipt: !!customerEmail,
        show_description: true,
        show_line_items: true,
        line_items: [
          {
            currency: "PHP",
            amount: Math.round(amountPesos * 100),
            description: description || "Booking down payment",
            name: description || "Booking down payment",
            quantity: 1,
          },
        ],
        payment_method_types: ["gcash", "paymaya", "card", "qrph"],
        description: description || "Booking down payment",
        reference_number: referenceNumber,
        success_url: successUrl,
        cancel_url: cancelUrl,
        billing: customerEmail || customerName ? {
          name: customerName || undefined,
          email: customerEmail || undefined,
        } : undefined,
      },
    },
  };

  return paymongoRequest("/checkout_sessions", { method: "POST", body: payload });
}

async function retrieveCheckoutSession(checkoutSessionId) {
  return paymongoRequest(`/checkout_sessions/${checkoutSessionId}`);
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
  createCheckoutSession,
  retrieveCheckoutSession,
  verifyWebhookSignature,
};
