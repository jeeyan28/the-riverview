// ─────────────────────────────────────────────────────────────────────────
// services/api.js — Phase 14. Shared low-level request helper every
// resource service module (bookings.js, rooms.js, users.js, pos.js,
// settings.js, …) is built on top of.
//
// This replaces the copy-pasted fetch() boilerplate that used to be
// re-typed at every call site across the admin pages
// (Bookings.jsx/Monitor.jsx/Pos.jsx/Settings.jsx/Users.jsx/…). Every one of
// those call sites was already doing the same 4 things, just with minor
// inconsistencies from having been hand-written N times:
//   1. fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ... })
//   2. JSON-encode the body + set 'Content-Type': 'application/json'
//      (except the couple of Settings.jsx call sites that send a
//      FormData body for image uploads, which must NOT get that header —
//      the browser sets its own multipart boundary)
//   3. Parse the response body as JSON, tolerating a non-JSON/empty body
//      via .catch(() => ({})) (some call sites already did this before
//      checking res.ok, some only did it in the error branch, one or two
//      didn't guard at all — see the file-header note in each service
//      module for where behavior was intentionally standardized because
//      the difference was never user-visible in the first place, e.g. a
//      list endpoint whose error is only ever console.error'd, never
//      alert()'d).
//   4. On !res.ok, throw an Error using the server's { message } if
//      present, else a per-call fallback string — and attach `err.status`
//      the same way AuthContext's login()/register() already do (Phase
//      13's comment on register() called this out explicitly as the
//      pattern to mirror). No call site anywhere in the app currently
//      reads err.status off a *resource* service call, but keeping the
//      shape identical to AuthContext's error objects means a page could
//      start relying on it later without every service needing a rewrite.
//
// credentials: 'include' is hard-coded for every call. Confirmed by
// grep before writing this that literally every single fetch() across
// Bookings.jsx/Monitor.jsx/Pos.jsx/Settings.jsx/Users.jsx/Dashboard.jsx/
// Profile.jsx passes it — there is no admin API call anywhere in the app
// that omits it, so there's nothing to preserve by making it optional.
//
// API_BASE_URL itself is unchanged from the literal 'http://localhost:3000'
// that used to be copy-pasted as a const at the top of every page file
// (and, separately, inside AuthContext.jsx — see the "confirm with you"
// note in this phase's chat response about whether AuthContext should
// move onto this module too).
// ─────────────────────────────────────────────────────────────────────────

export const API_BASE_URL = 'http://localhost:3000';

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
