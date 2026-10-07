import { apiRequest, ApiError } from './api.js';

const BASE = '/api/payments/paymongo';
const PROVIDER_BASE = (import.meta.env?.VITE_PAYMONGO_API_BASE || 'https://api.paymongo.com/v1').replace(/\/+$/, '');
const PAYMENT_OUTCOMES = [402, 409, 410];

function invalidResponse() {
  return new ApiError('Could not verify the payment response. Check your reservations before trying another payment.', { code: 'INVALID_RESPONSE' });
}

function isSecureRedirect(value) {
  try { return typeof value === 'string' && new URL(value).protocol === 'https:'; }
  catch { return false; }
}

async function paymentResponse(path, options) {
  let result;
  try { result = { data: await apiRequest(path, options), httpStatus: 200 }; }
  catch (error) {
    if (error.code !== 'HTTP_ERROR' || !PAYMENT_OUTCOMES.includes(error.status)) throw error;
    result = { data: error.data, httpStatus: error.status };
  }
  const { data, httpStatus } = result;
  if ((!data.status || typeof data.status !== 'string') && ![402, 410].includes(httpStatus)) throw invalidResponse();
  if (data.status === 'succeeded' && !data.bookingId) throw invalidResponse();
  if (data.status === 'awaiting_next_action' && !isSecureRedirect(data.redirectUrl)) throw invalidResponse();
  return result;
}

export const paymentsService = {
  config: options => apiRequest(`${BASE}/config`, { ...options, fallbackMessage: 'Could not load payment methods.' }),

  async createIntent(payload, options = {}) {
    const data = await apiRequest(`${BASE}/intent`, { ...options, method: 'POST', body: payload, fallbackMessage: 'Could not start online payment.' });
    if (data.gateway === 'xendit') {
      if (!data.referenceId || !isSecureRedirect(data.redirectUrl)) throw invalidResponse();
    } else if (typeof data.paymentIntentId !== 'string' || !data.paymentIntentId || typeof data.clientKey !== 'string' || !data.clientKey) {
      throw invalidResponse();
    }
    return data;
  },

  status(id, { provider = 'paymongo', ...options } = {}) {
    const base = provider === 'xendit' ? '/api/payments/xendit' : BASE;
    return paymentResponse(`${base}/status/${encodeURIComponent(id)}`, { ...options, fallbackMessage: 'Could not verify payment status.' });
  },

  attach(id, payload, options = {}) {
    return paymentResponse(`${BASE}/intent/${encodeURIComponent(id)}/attach`, {
      ...options, method: 'POST', body: payload, fallbackMessage: 'Payment could not be processed. Check your reservations before trying again.',
    });
  },

  async createCardMethod(publicKey, details, guestName, options = {}) {
    let data;
    try {
      data = await apiRequest('/payment_methods', {
        ...options, baseUrl: PROVIDER_BASE, credentials: 'omit', method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${publicKey}:`)}` },
        body: { data: { attributes: { type: 'card', details, billing: guestName ? { name: guestName.trim() } : undefined } } },
        fallbackMessage: 'Card could not be verified. Please check the details and try again.',
      });
    } catch (error) {
      if (error.data?.errors?.[0]?.detail) error.message = error.data.errors[0].detail;
      throw error;
    }
    if (typeof data.data?.id !== 'string' || !data.data.id) throw invalidResponse();
    return data.data.id;
  },
};
