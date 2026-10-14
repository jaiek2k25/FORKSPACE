/**
 * Authorised REST adapter.
 *
 * For a partner who has given FORKSPACE written permission to call their API.
 * Rules enforced here:
 *   - disabled unless a base URL, an API key and a licensee name are all present
 *   - HTTPS only; a plain-HTTP endpoint is refused outright
 *   - redirects are refused, so a request cannot be bounced elsewhere
 *   - bearer authentication, with the key read from the environment only
 *   - the key is never logged, never returned, and never exposed to the browser
 *   - no scraping: this calls a documented endpoint the licensee authorised
 */
import { validateSource } from '../../assets/js/data/schema.js';
import { logger } from '../logger.js';

const HTTPS = /^https:\/\//i;

/** @returns {{enabled: boolean, reason: string|null, baseUrl: string|null}} */
export function readAuthorisedFeedConfig(env = process.env) {
  const baseUrl = env.AUTHORISED_FEED_URL || '';
  const apiKey = env.AUTHORISED_FEED_KEY || '';
  const licensee = env.AUTHORISED_FEED_LICENSEE || '';
  if (!baseUrl || !apiKey || !licensee) {
    return { enabled: false, reason: 'not_configured', baseUrl: null, licensee: licensee || null };
  }
  if (!HTTPS.test(baseUrl)) {
    return { enabled: false, reason: 'insecure_upstream_refused', baseUrl: null, licensee };
  }
  return { enabled: true, reason: null, baseUrl, licensee, apiKey };
}

/**
 * Fetch listings from the authorised feed.
 * Any failure degrades to "no records" plus a status line: the app keeps working
 * with the demo dataset rather than failing to start.
 */
export async function loadAuthorisedFeed({ env = process.env, userAgent = 'FORKSPACE (authorised feed client)', fetchImpl = globalThis.fetch } = {}) {
  const settings = readAuthorisedFeedConfig(env);
  const status = {
    configured: settings.enabled,
    reason: settings.reason,
    licensee: settings.licensee || null,
    accepted: 0,
    rejected: []
  };
  if (!settings.enabled) {
    logger.info(`authorised REST adapter disabled (${settings.reason}); the app runs on the demo dataset only`);
    return { records: [], status };
  }

  const timeoutMs = Number(env.AUTHORISED_FEED_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${settings.baseUrl.replace(/\/$/, '')}/listings`, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
        'User-Agent': userAgent
      }
    });
    if (!response.ok) {
      status.reason = `upstream_http_${response.status}`;
      logger.warn(`authorised feed returned HTTP ${response.status}; continuing without it`);
      return { records: [], status };
    }
    const payload = await response.json();
    const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.records) ? payload.records : [];
    const records = [];
    for (const [index, record] of raw.entries()) {
      const sourceCheck = validateSource(record?.source);
      if (!sourceCheck.ok) {
        status.rejected.push({ index, id: record?.id, reason: `source is incomplete: ${sourceCheck.errors.join('; ')}` });
        continue;
      }
      records.push({
        ...record,
        provenance: {
          ...record.provenance,
          isDemo: false,
          fetchedAt: record.provenance?.fetchedAt || new Date().toISOString()
        }
      });
    }
    status.accepted = records.length;
    status.reason = null;
    logger.info(`authorised feed loaded ${records.length} record(s) under licence "${settings.licensee}"`);
    return { records, status };
  } catch (error) {
    // The message is mapped to a fixed token: an upstream error body could echo
    // the key back, so it is never passed through.
    const aborted = error?.name === 'AbortError';
    status.reason = aborted ? 'upstream_timeout' : 'upstream_unreachable';
    logger.warn(`authorised feed could not be used (${status.reason}); continuing without it`);
    return { records: [], status };
  } finally {
    clearTimeout(timer);
  }
}
