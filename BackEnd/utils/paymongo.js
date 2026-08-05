const crypto = require("crypto");
const PAYMONGO_API_BASE = process.env.PAYMONGO_API_BASE || "https://api.paymongo.com/v1";
const PAYMONGO_ALLOWED_METHODS = ["card", "gcash", "paymaya", "qrph"];
const PAYMONGO_STATEMENT_DESCRIPTOR_MAX_LENGTH = 22;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${PAYMONGO_API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      const timeoutErr = new Error(`PayMongo API error: request timed out after ${timeoutMs}ms`);
      timeoutErr.status = 504;
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  let json = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    if (!res.ok) {
      console.error(`PayMongo request to ${path} got a non-JSON ${res.status} response:`, rawText.slice(0, 500));
    }
  }

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

async function paymongoRequest(path, { method = "GET", body, timeoutMs = 15000, retries = 1 } = {}) {
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
  getPublicKey,
  createPaymentIntent,
  retrievePaymentIntent,
  createWalletPaymentMethod,
  attachPaymentIntent,
  verifyWebhookSignature,
};