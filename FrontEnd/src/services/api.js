

export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/**
 * Low-level request helper. Every services/*.js resource module wraps this
 * instead of calling fetch() directly.
 *
 * @param {string} path - e.g. '/api/users'. Appended to API_BASE_URL as-is.
 * @param {object} [opts]
 * @param {string} [opts.method='GET']
 * @param {object|FormData} [opts.body] - Plain objects are JSON.stringify'd
 *   (and get a Content-Type: application/json header). FormData is passed
 *   through untouched with no Content-Type header, so the browser can set
 *   its own multipart boundary — required for Settings.jsx's room-image
 *   upload call sites.
 * @param {object} [opts.headers] - Extra headers, merged in.
 * @param {string} [opts.fallbackMessage='Request failed.'] - Used as the
 *   thrown Error's message when the server response is not ok and has no
 *   JSON { message } field of its own.
 * @returns {Promise<any>} the parsed JSON response body on success.
 * @throws {Error} with `.status` set to the HTTP status code on failure.
 */
export async function apiRequest(path, opts = {}) {
  const { method = 'GET', body, headers, fallbackMessage = 'Request failed.' } = opts;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  // Only attach a Content-Type header when there's actually a JSON body to
  // describe — matches every original GET/DELETE call site, none of which
  // ever set this header.
  const finalHeaders = body !== undefined && !isFormData ? { 'Content-Type': 'application/json', ...(headers || {}) } : headers;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    ...(finalHeaders ? { headers: finalHeaders } : {}),
    ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  });

  // Tolerate an empty/non-JSON body in every case (success or failure) —
  // a couple of original call sites only did this in the failure branch;
  // standardized here since no call site anywhere reads a *raw*, unparsed
  // response, and this can only ever matter on a malformed/empty body,
  // never on ordinary JSON responses.
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.message || fallbackMessage);
    err.status = res.status;
    throw err;
  }
  return data;
}
