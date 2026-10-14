/**
 * Thin wrapper around the FORKSPACE JSON API.
 *
 * Every call returns { ok, data, error } so views never have to guard against
 * exceptions, and error messages surface the server's own wording (which never
 * contains a configured value).
 */

async function request(path, options = {}) {
  try {
    const response = await fetch(path, {
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      const message = payload?.error?.message || `Request failed with status ${response.status}.`;
      return { ok: false, status: response.status, error: { code: payload?.error?.code || 'http_error', message } };
    }
    return { ok: true, status: response.status, data: payload };
  } catch (error) {
    return { ok: false, status: 0, error: { code: 'network_error', message: `Could not reach the FORKSPACE API (${error.message}).` } };
  }
}

export const api = {
  health: () => request('/api/health'),
  sources: () => request('/api/sources'),
  listings: () => request('/api/listings'),
  aiStatus: () => request('/api/ai/status'),
  extract: (brief) => request('/api/ai/extract', { method: 'POST', body: JSON.stringify({ brief }) }),
  geoStatus: () => request('/api/geo/status'),
  geocode: (query) => request(`/api/geocode?q=${encodeURIComponent(query)}`)
};
