/**
 * Configuration: one place, validated at start-up.
 *
 * Rules followed here:
 *   - Refuse to start on an invalid PORT or a non-HTTPS upstream URL.
 *   - Warn (never stop) on a missing geocoder contact or missing API keys.
 *   - Error and warning messages never contain a configured value, so a secret
 *     can never leak through a log line, an exception or an HTTP response.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from './env.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = '1.0.0';

export const DEFAULTS = Object.freeze({
  PORT: 5173,
  HOST: '0.0.0.0',
  NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
  NVIDIA_MODEL: 'poolside/laguna-xs-2.1',
  AI_TEMPERATURE: 0,
  AI_MAX_TOKENS: 700,
  AI_TIMEOUT_MS: 20000,
  AI_RATE_PER_MIN: 20,
  AI_TEXT_LIMIT: 1000,
  AI_BODY_LIMIT: 4096,
  GEOCODE_RATE_PER_MIN: 30,
  NOMINATIM_BASE_URL: 'https://nominatim.openstreetmap.org',
  NOMINATIM_MIN_INTERVAL_MS: 1000,
  GEOCODE_CACHE_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  GEOCODE_TIMEOUT_MS: 12000,
  GOOGLE_GEOCODE_URL: 'https://maps.googleapis.com/maps/api/geocode/json',
  HEADERS_TIMEOUT_MS: 15000,
  REQUEST_TIMEOUT_MS: 30000
});

const HTTPS = /^https:\/\//i;

function intFrom(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function boolFrom(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase?.() === 'true' || value === 'yes';
}

/**
 * Build the runtime configuration object.
 * @returns {{config: object, errors: Array<{field: string, message: string}>, warnings: string[]}}
 */
export function loadConfig(env = process.env) {
  const errors = [];
  const warnings = [];

  const port = intFrom(env.PORT, DEFAULTS.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push({ field: 'PORT', message: `PORT must be an integer between 1 and 65535 (got ${Number.isNaN(port) ? 'a non-numeric value' : 'an out-of-range number'}).` });
  }

  const nvidiaBaseUrl = env.NVIDIA_BASE_URL || DEFAULTS.NVIDIA_BASE_URL;
  const nominatimBaseUrl = env.NOMINATIM_BASE_URL || DEFAULTS.NOMINATIM_BASE_URL;
  const googleGeocodeUrl = env.GOOGLE_GEOCODE_URL || DEFAULTS.GOOGLE_GEOCODE_URL;
  for (const [field, value] of [
    ['NVIDIA_BASE_URL', nvidiaBaseUrl],
    ['NOMINATIM_BASE_URL', nominatimBaseUrl],
    ['GOOGLE_GEOCODE_URL', googleGeocodeUrl]
  ]) {
    if (!HTTPS.test(value)) {
      errors.push({ field, message: `${field} must be an https:// URL; plain HTTP upstreams are refused.` });
    }
  }

  const hstsRaw = env.HSTS_MAX_AGE;
  const hstsMaxAge = intFrom(hstsRaw, 0);
  if (!Number.isInteger(hstsMaxAge) || hstsMaxAge < 0) {
    errors.push({ field: 'HSTS_MAX_AGE', message: 'HSTS_MAX_AGE must be a non-negative integer (seconds).' });
  }

  const geocoderProvider = (env.GEOCODER || 'nominatim').toLowerCase();
  if (!['nominatim', 'google', 'none'].includes(geocoderProvider)) {
    errors.push({ field: 'GEOCODER', message: 'GEOCODER must be one of: nominatim, google, none.' });
  }

  const nvidiaApiKey = env.NVIDIA_API_KEY || '';
  const googleApiKey = env.GOOGLE_MAPS_API_KEY || '';
  const contact = env.GEOCODER_CONTACT || '';

  if (!nvidiaApiKey) {
    warnings.push('NVIDIA_API_KEY is not configured: the research assistant will use the deterministic demo adapter.');
  }
  if (!contact) {
    warnings.push('GEOCODER_CONTACT is not configured: the public geocoder proxy is disabled because the OpenStreetMap Nominatim usage policy requires an identifying contact.');
  }
  if (geocoderProvider === 'google' && !googleApiKey) {
    warnings.push('GEOCODER=google was requested without GOOGLE_MAPS_API_KEY: geocoding will answer 503 not_configured. Billing applies to the Google provider.');
  }

  const contactHost = contact.replace(/^[^@]*@/, '').split('/')[0] || '';
  const userAgent = contact
    ? `FORKSPACE/${VERSION} (rental research prototype; contact: ${contact})`
    : `FORKSPACE/${VERSION} (rental research prototype; contact not configured)`;

  const config = {
    version: VERSION,
    root: ROOT,
    nodeEnv: env.NODE_ENV || 'development',
    port: Number.isInteger(port) ? port : DEFAULTS.PORT,
    host: env.HOST || DEFAULTS.HOST,
    trustProxy: boolFrom(env.TRUST_PROXY, false),
    hstsMaxAge: Number.isInteger(hstsMaxAge) ? hstsMaxAge : 0,
    logLevel: env.LOG_LEVEL || 'info',
    licensedDataDir: path.resolve(ROOT, env.LICENSED_DATA_DIR || 'data-imports'),
    ai: {
      provider: 'nvidia',
      enabled: Boolean(nvidiaApiKey),
      model: env.NVIDIA_MODEL || DEFAULTS.NVIDIA_MODEL,
      baseUrl: nvidiaBaseUrl,
      temperature: DEFAULTS.AI_TEMPERATURE,
      maxTokens: intFrom(env.AI_MAX_TOKENS, DEFAULTS.AI_MAX_TOKENS),
      timeoutMs: intFrom(env.AI_TIMEOUT_MS, DEFAULTS.AI_TIMEOUT_MS),
      textLimit: DEFAULTS.AI_TEXT_LIMIT,
      bodyLimit: DEFAULTS.AI_BODY_LIMIT,
      ratePerMinute: intFrom(env.AI_RATE_PER_MIN, DEFAULTS.AI_RATE_PER_MIN)
    },
    geo: {
      provider: geocoderProvider,
      contact,
      contactHost,
      userAgent,
      nominatimBaseUrl,
      googleGeocodeUrl,
      minIntervalMs: intFrom(env.NOMINATIM_MIN_INTERVAL_MS, DEFAULTS.NOMINATIM_MIN_INTERVAL_MS),
      cacheTtlMs: DEFAULTS.GEOCODE_CACHE_TTL_MS,
      timeoutMs: intFrom(env.GEOCODE_TIMEOUT_MS, DEFAULTS.GEOCODE_TIMEOUT_MS),
      ratePerMinute: intFrom(env.GEOCODE_RATE_PER_MIN, DEFAULTS.GEOCODE_RATE_PER_MIN),
      // Nominatim requires a contact; Google requires a key. Both live server-side only.
      enabled:
        geocoderProvider === 'nominatim'
          ? Boolean(contact)
          : geocoderProvider === 'google'
            ? Boolean(googleApiKey)
            : false
    },
    limits: {
      headersTimeoutMs: DEFAULTS.HEADERS_TIMEOUT_MS,
      requestTimeoutMs: DEFAULTS.REQUEST_TIMEOUT_MS
    },
    secrets: {
      // Kept as an opaque set for redaction only; values are never printed.
      count: [nvidiaApiKey, googleApiKey].filter(Boolean).length,
      hasNvidiaKey: Boolean(nvidiaApiKey),
      hasGoogleKey: Boolean(googleApiKey)
    }
  };

  // Keys are attached only for outbound calls, and never serialised.
  Object.defineProperty(config, 'runtimeSecrets', {
    value: { nvidiaApiKey, googleApiKey },
    enumerable: false,
    writable: false,
    configurable: false
  });

  return { config, errors, warnings };
}

/** Load .env (git-ignored) then validate. Values are never returned or logged. */
export function initConfig(env = process.env) {
  const applied = loadEnvFile(path.join(ROOT, '.env'), env);
  const result = loadConfig(env);
  return { ...result, envFileApplied: applied };
}

export function envExamplePresent() {
  return existsSync(path.join(ROOT, '.env.example'));
}

/**
 * Startup log lines. Names and booleans only: no configured value ever appears,
 * because a URL can legitimately contain a key in its query string.
 */
export function describeConfig(result) {
  const { config, errors, warnings } = result;
  const lines = [
    `FORKSPACE v${config.version} starting`,
    `mode: ${config.nodeEnv} · port: ${config.port} · trust proxy: ${config.trustProxy ? 'on' : 'off'}`,
    `research assistant: ${config.ai.enabled ? 'model adapter configured' : 'demo adapter (no key configured)'}`,
    `geocoder: ${config.geo.provider} · ${config.geo.enabled ? 'enabled' : 'disabled (missing contact or key)'}`,
    `HSTS: ${config.hstsMaxAge > 0 ? 'on' : 'off'} · rate limits: ai ${config.ai.ratePerMinute}/min, geocode ${config.geo.ratePerMinute}/min`
  ];
  for (const warning of warnings) lines.push(`warning: ${warning}`);
  for (const error of errors) lines.push(`error: ${error.field}: ${error.message}`);
  return lines;
}
