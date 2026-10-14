/**
 * Listing service.
 *
 * The demo dataset is imported straight from the browser modules so the server
 * and the client can never disagree about the records. Every record is validated
 * against the shared schema before it is served, and a record that fails
 * validation is dropped with a loud log line rather than served half-broken.
 *
 * Live listing data can only arrive through the two adapters below: a licensed
 * file export, or an authorised REST feed with credentials. Nothing reads from a
 * listing site, and there is no scraper anywhere in this codebase.
 */
import { LISTINGS } from '../assets/js/data/listings.js';
import { validateListing, SCHEMA_VERSION } from '../assets/js/data/schema.js';
import { loadLicensedFile } from './adapters/licensed-file.js';
import { loadAuthorisedFeed } from './adapters/authorised-rest.js';
import { logger } from './logger.js';

let cache = null;

function validateAll(records, origin) {
  const accepted = [];
  const rejected = [];
  for (const record of records) {
    const result = validateListing(record);
    if (result.ok) accepted.push(record);
    else {
      rejected.push({ id: record?.id || '(no id)', errors: result.errors });
      // Names only: a record body could contain anything.
      logger.warn(`rejected a ${origin} record (${record?.id || 'no id'}) because it failed schema validation`, result.errors);
    }
  }
  return { accepted, rejected };
}

/**
 * Build the served dataset.
 * @param {object} config
 * @returns {Promise<{listings: Array, demo: boolean, sources: Array, rejected: Array, importedAt: string|null}>}
 */
export async function loadListings(config, { force = false } = {}) {
  if (cache && !force) return cache;

  const demo = validateAll(LISTINGS, 'demo');
  const licensed = await loadLicensedFile(config.licensedDataDir);
  const feed = await loadAuthorisedFeed({ env: config.env || process.env, userAgent: config.geo?.userAgent });

  const licensedValidated = validateAll(licensed.records, 'licensed-file');
  const feedValidated = validateAll(feed.records, 'authorised-rest');

  const listings = [...demo.accepted, ...licensedValidated.accepted, ...feedValidated.accepted];

  cache = {
    listings,
    schemaVersion: SCHEMA_VERSION,
    demo: demo.accepted.length === listings.length,
    counts: {
      total: listings.length,
      demo: demo.accepted.length,
      licensedFile: licensedValidated.accepted.length,
      authorisedFeed: feedValidated.accepted.length
    },
    rejected: [...demo.rejected, ...licensedValidated.rejected, ...feedValidated.rejected],
    adapters: {
      licensedFile: licensed.status,
      authorisedFeed: feed.status
    },
    importedAt: licensedValidated.accepted.length || feedValidated.accepted.length ? new Date().toISOString() : null,
    generatedAt: new Date().toISOString()
  };

  logger.info(`listing service ready: ${cache.counts.total} record(s) — ${Object.entries(cache.counts).filter(([key]) => key !== 'total').map(([key, value]) => `${key}: ${value}`).join(', ')}`);
  return cache;
}

export function clearListingsCache() {
  cache = null;
}

export function demoListings() {
  return LISTINGS;
}
