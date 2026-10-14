/**
 * Geocoding.
 *
 * Two providers, both server-side only:
 *
 *   nominatim (default) — OpenStreetMap's public service. Its usage policy is
 *     enforced here, not merely documented:
 *       · at most one request per second, serialised through a queue
 *       · an identifying User-Agent that includes the operator's contact
 *       · results cached for 30 days
 *       · redirects refused
 *       · no autocomplete and no bulk lookups: one query per request, and the
 *         browser never calls this while a visitor types
 *     Attribution "© OpenStreetMap contributors (ODbL)" is returned with every
 *     result so the interface cannot display a result without it.
 *
 *   google — used only when GEOCODER=google and GOOGLE_MAPS_API_KEY is set.
 *     The key never leaves the server. Billing applies to the operator's
 *     Google account. Without a key the endpoint answers 503 not_configured.
 *
 * Nothing here ever scrapes a map service.
 */
import { logger } from './logger.js';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';
export const GOOGLE_ATTRIBUTION = 'Geocoding by Google Maps Platform';
export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 200;

/** Validate a query string. Returns { ok, value } or { ok: false, reason }. */
export function validateQuery(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) return { ok: false, reason: 'missing_query', message: 'Add a search term: the geocoder needs a place name or address.' };
  if (value.length < MIN_QUERY_LENGTH) return { ok: false, reason: 'query_too_short', message: `The search term must be at least ${MIN_QUERY_LENGTH} characters.` };
  if (value.length > MAX_QUERY_LENGTH) return { ok: false, reason: 'query_too_long', message: `The search term must be at most ${MAX_QUERY_LENGTH} characters.` };
  // Policy: no bulk or list-style submissions.
  if (value.split('\n').length > 1) return { ok: false, reason: 'bulk_query_refused', message: 'One place per request. Bulk geocoding is not supported.' };
  return { ok: true, value };
}

/**
 * Serialises outbound calls so consecutive requests are spaced by at least
 * `minIntervalMs`. The clock is injectable so tests can stub it.
 */
export class MinIntervalQueue {
  constructor(minIntervalMs, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleep = sleep;
    this.lastStartedAt = null;
    this.chain = Promise.resolve();
    this.waits = 0;
  }

  /** Queue `task`, ensuring the spacing rule. Returns the task's result. */
  run(task) {
    const result = this.chain.then(async () => {
      if (this.lastStartedAt !== null) {
        const elapsed = this.now() - this.lastStartedAt;
        const wait = this.minIntervalMs - elapsed;
        if (wait > 0) {
          this.waits += 1;
          await this.sleep(wait);
        }
      }
      this.lastStartedAt = this.now();
      return task();
    });
    // Keep the chain alive even if a task rejects, so one failure does not jam the queue.
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** Simple TTL cache. Injection of `now` keeps it testable. */
export class TtlCache {
  constructor(ttlMs, now = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }

  get size() {
    return this.entries.size;
  }

  sweep() {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

function normaliseQuery(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function createGeocoder(config, {
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep,
  cache = new TtlCache(config.geo.cacheTtlMs, now),
  queue = new MinIntervalQueue(config.geo.minIntervalMs, now, sleep)
} = {}) {
  const { provider, enabled, contact, userAgent, nominatimBaseUrl, googleGeocodeUrl, timeoutMs } = config.geo;

  async function fetchJson(url, headers, providerLabel) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error', // a redirect could send us somewhere we did not intend
        signal: controller.signal,
        headers
      });
      if (!response.ok) {
        // Status only: an upstream body could contain anything, including a key.
        return { ok: false, code: `upstream_http_${response.status}`, message: `The ${providerLabel} geocoder responded with HTTP ${response.status}.` };
      }
      const payload = await response.json();
      return { ok: true, payload };
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      return {
        ok: false,
        code: aborted ? 'upstream_timeout' : 'upstream_unreachable',
        message: aborted
          ? `The ${providerLabel} geocoder did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
          : `The ${providerLabel} geocoder could not be reached.`
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function mapNominatim(payload) {
    return (Array.isArray(payload) ? payload : []).slice(0, 5).map((item) => ({
      label: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      type: item.type || item.class || null,
      importance: Number.isFinite(Number(item.importance)) ? Number(item.importance) : null,
      boundingBox: Array.isArray(item.boundingbox) ? item.boundingbox.map(Number) : null
    }));
  }

  function mapGoogle(payload) {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results.slice(0, 5).map((item) => ({
      label: item.formatted_address,
      lat: Number(item.geometry?.location?.lat),
      lng: Number(item.geometry?.location?.lng),
      type: Array.isArray(item.types) ? item.types[0] : null,
      importance: null,
      boundingBox: item.geometry?.viewport
        ? [item.geometry.viewport.southwest?.lat, item.geometry.viewport.northeast?.lat, item.geometry.viewport.southwest?.lng, item.geometry.viewport.northeast?.lng]
        : null
    }));
  }

  /** Geocode one query. Never throws: always returns a plain result object. */
  async function geocode(rawQuery) {
    const validation = validateQuery(rawQuery);
    if (!validation.ok) return { ok: false, status: 400, code: validation.reason, message: validation.message };

    if (provider === 'none') {
      return { ok: false, status: 503, code: 'geocoder_disabled', message: 'Geocoding is switched off in this deployment.' };
    }
    if (!enabled) {
      if (provider === 'google') {
        return {
          ok: false, status: 503, code: 'not_configured',
          message: 'Google geocoding is requested but no Google Maps API key is configured on the server. Billing applies to the Google provider, so nothing is called without a key.'
        };
      }
      return {
        ok: false, status: 503, code: 'geocoder_disabled',
        message: 'The public geocoder is disabled because no GEOCODER_CONTACT is configured. The OpenStreetMap Nominatim usage policy requires an identifying contact, so FORKSPACE will not call it without one.'
      };
    }

    const key = `${provider}:${normaliseQuery(validation.value)}`;
    const cached = cache.get(key);
    if (cached) return { ok: true, status: 200, data: { ...cached, cached: true } };

    let outcome;
    if (provider === 'nominatim') {
      const url = `${nominatimBaseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(validation.value)}&format=jsonv2&limit=5&addressdetails=0`;
      outcome = await queue.run(() => fetchJson(url, {
        'User-Agent': userAgent,
        Accept: 'application/json',
        'Accept-Language': 'en'
      }, 'OpenStreetMap Nominatim'));
      if (!outcome.ok) return { ok: false, status: 502, code: outcome.code, message: outcome.message };
      const data = {
        query: validation.value,
        provider: 'nominatim',
        providerLabel: 'OpenStreetMap Nominatim',
        results: mapNominatim(outcome.payload),
        attribution: OSM_ATTRIBUTION,
        attributionUrl: 'https://www.openstreetmap.org/copyright',
        licence: 'Open Database License (ODbL) 1.0',
        policy: 'One request per second, identifying contact required, results cached for 30 days, redirects refused, no autocomplete and no bulk use.',
        fetchedAt: new Date(now()).toISOString(),
        cached: false
      };
      cache.set(key, data);
      return { ok: true, status: 200, data };
    }

    const url = `${googleGeocodeUrl}?address=${encodeURIComponent(validation.value)}&key=${encodeURIComponent(config.runtimeSecrets.googleApiKey)}`;
    outcome = await queue.run(() => fetchJson(url, { Accept: 'application/json' }, 'Google Maps'));
    if (!outcome.ok) return { ok: false, status: 502, code: outcome.code, message: outcome.message };
    const data = {
      query: validation.value,
      provider: 'google',
      providerLabel: 'Google Maps Geocoding',
      results: mapGoogle(outcome.payload),
      attribution: GOOGLE_ATTRIBUTION,
      attributionUrl: 'https://developers.google.com/maps/documentation/geocoding/overview',
      licence: 'Google Maps Platform terms; billing applies',
      policy: 'Server-side only. The key is never sent to the browser. Results are cached for 30 days to limit calls.',
      fetchedAt: new Date(now()).toISOString(),
      cached: false
    };
    cache.set(key, data);
    return { ok: true, status: 200, data };
  }

  function status() {
    return {
      provider,
      enabled,
      configured: enabled,
      contactConfigured: Boolean(contact),
      contactHost: config.geo.contactHost || null,
      attribution: provider === 'google' ? GOOGLE_ATTRIBUTION : OSM_ATTRIBUTION,
      cacheTtlDays: Math.round(config.geo.cacheTtlMs / 86_400_000),
      minIntervalMs: config.geo.minIntervalMs,
      ratePerMinute: config.geo.ratePerMinute,
      policy: provider === 'nominatim'
        ? 'Public Nominatim service used within its usage policy: one request per second, identifying contact, 30-day cache, redirects refused, no autocomplete, no bulk geocoding.'
        : provider === 'google'
          ? 'Google Maps Geocoding is called server-side only, with the API key held on the server. Billing applies.'
          : 'Geocoding is switched off.',
      notes: [
        'Geocoding applies to real listing addresses only. Every record in this build is fictional and has no coordinates, so no demo home is ever geocoded.',
        'FORKSPACE never scrapes a map service, and never uses the browser to call a map provider directly.',
        'The browser never calls this endpoint while a visitor types: there is no autocomplete.'
      ],
      cacheEntries: cache.size,
      queuedSpacings: queue.waits
    };
  }

  return { geocode, status, cache, queue, sweep: () => cache.sweep() };
}
