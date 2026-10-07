const AppError = require('./appError');

async function fetchJson(url, { timeoutMs = 15000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const rawText = await response.text();
    let data = {};
    try {
      data = JSON.parse(rawText);
      if (data === null || typeof data !== 'object') throw new Error();
    } catch {
      if (response.ok) throw new AppError(502, 'Payment provider returned an invalid response.');
      data = {};
    }
    return { response, data, rawText };
  } catch (error) {
    if (controller.signal.aborted) {
      const timeout = new AppError(504, 'Payment provider request timed out.');
      timeout.isTimeout = true;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchJson };
