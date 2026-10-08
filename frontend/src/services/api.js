export const API_BASE_URL = (import.meta.env?.VITE_API_URL || '').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor(message, { status = 0, data = {}, code = 'HTTP_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.serverCode = data?.code;
    this.requestId = data?.requestId;
    this.data = data;
    this.field = data?.field;
    this.unverified = Boolean(data?.unverified);
    this.errors = data?.errors;
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object') throw new Error();
    return data;
  } catch (cause) {
    throw new ApiError('The server returned an invalid response. Refresh and try again.', {
      status: response.status, code: 'INVALID_RESPONSE', cause,
    });
  }
}

async function request(path, options, readResponse) {
  const { method = 'GET', body, headers, signal, baseUrl = API_BASE_URL, credentials = 'include', timeoutMs = REQUEST_TIMEOUT_MS, fallbackMessage = 'Request failed.' } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !isFormData && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  const payload = body === undefined ? undefined : isFormData ? body : JSON.stringify(body);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) throw signal.reason || new DOMException('Request cancelled.', 'AbortError');
    const response = await fetch(`${baseUrl}${path}`, {
      method, credentials, headers: requestHeaders, body: payload, signal: controller.signal,
    });
    if (!response.ok) {
      let data;
      try { data = await readJson(response); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        data = {};
      }
      throw new ApiError(data.message || fallbackMessage, { status: response.status, data });
    }
    return await readResponse(response);
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    if (timedOut) {
      const message = ['GET', 'HEAD'].includes(method.toUpperCase())
        ? 'The server took too long to respond. Please try again.'
        : 'The request timed out. Check the latest record before trying again.';
      throw new ApiError(message, { code: 'TIMEOUT', cause: error });
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('Could not reach the server. Check your connection and try again.', { code: 'NETWORK_ERROR', cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}

export function apiRequest(path, options = {}) {
  return request(path, options, readJson);
}

export async function apiDownload(path, { filename, contentType, ...options } = {}) {
  const { blob, disposition } = await request(path, { timeoutMs: 60000, ...options }, async response => {
    if (contentType && response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== contentType) {
      throw new ApiError('The server could not generate the file. Please try again.', { status: response.status, code: 'INVALID_RESPONSE' });
    }
    return { blob: await response.blob(), disposition: response.headers.get('Content-Disposition') || '' };
  });
  const match = disposition.match(/filename="([^"]+)"/i);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = match?.[1] || filename || 'download';
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
