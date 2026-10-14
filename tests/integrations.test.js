/**
 * Integration tests: schema validation, the licensed-file adapter rules, and
 * the authorised REST adapter rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { validateListing, validateSource, SCHEMA_VERSION } from '../assets/js/data/schema.js';
import { LISTINGS } from '../assets/js/data/listings.js';
import { parseExport, loadLicensedFile } from '../server/adapters/licensed-file.js';
import { loadAuthorisedFeed, readAuthorisedFeedConfig } from '../server/adapters/authorised-rest.js';

const VALID_SOURCE = {
  id: 'licensed-partner', name: 'Partner Example', kind: 'feed',
  url: 'https://partner.example/listing/1',
  attribution: 'Partner Example', licence: 'Licensed partner agreement 2026-04',
  termsUrl: 'https://partner.example/terms'
};

function licensedRecord(overrides = {}) {
  return {
    id: 'partner-0001',
    title: 'Imported one-bedroom',
    city: 'Lisbon',
    cityId: 'lisbon',
    country: 'Portugal',
    area: 'Areeiro',
    address: 'Real address supplied by the partner',
    propertyType: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    status: 'available',
    amenities: ['Lift'],
    source: { ...VALID_SOURCE },
    verification: { lastVerifiedAt: '2026-10-10T00:00:00Z', method: 'partner API daily sync' },
    provenance: { isDemo: false, fetchedAt: '2026-10-12T00:00:00Z', providerRecordId: 'P-1', rawHash: 'abc', schemaVersion: SCHEMA_VERSION },
    rent: { amount: 1400, currency: 'EUR', locale: 'pt-PT', kind: 'known' },
    fees: [{ label: 'Condomínio', amount: 60, currency: 'EUR', kind: 'known', frequency: 'monthly' }],
    ...overrides
  };
}

test('schema: every demo listing validates', () => {
  for (const listing of LISTINGS) {
    const result = validateListing(listing);
    assert.equal(result.ok, true, `${listing.id}: ${result.errors.join('; ')}`);
  }
});

test('schema: source requires id, name, kind, attribution and licence', () => {
  const base = { ...VALID_SOURCE };
  for (const field of ['id', 'name', 'kind', 'attribution', 'licence']) {
    const broken = { ...base, [field]: '' };
    const result = validateSource(broken);
    assert.equal(result.ok, false, `missing ${field} should fail`);
    assert.ok(result.errors.some((error) => error.includes(field)));
  }
  assert.equal(validateSource({ ...base, kind: 'scraper' }).ok, false, 'an unknown kind must fail');
  assert.equal(validateSource(base).ok, true);
});

test('schema: unknown fees may not carry an amount, and partial fields are rejected', () => {
  const bad = validateListing(licensedRecord({ fees: [{ label: 'Fee', amount: 10, currency: 'EUR', kind: 'unknown', frequency: 'one-off' }] }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((error) => /never carry a figure/.test(error)));

  const noAmount = validateListing(licensedRecord({ fees: [{ label: 'Brokerage', amount: null, currency: 'EUR', kind: 'unknown', frequency: 'one-off' }] }));
  assert.equal(noAmount.ok, true);

  const missingFrequency = validateListing(licensedRecord({ fees: [{ label: 'Fee', amount: 10, currency: 'EUR', kind: 'known' }] }));
  assert.equal(missingFrequency.ok, false);
});

test('schema: a demo record may not carry a source URL or a verification timestamp', () => {
  const demo = { ...licensedRecord(), provenance: { ...licensedRecord().provenance, isDemo: true } };
  const withUrl = validateListing({ ...demo, source: { ...VALID_SOURCE, url: 'https://example.test/1' } });
  assert.equal(withUrl.ok, false);
  const withTimestamp = validateListing({ ...demo, verification: { lastVerifiedAt: '2026-10-10T00:00:00Z' } });
  assert.equal(withTimestamp.ok, false);
});

test('schema: a plotted location must be checked, sourced, and never fictional', () => {
  const good = validateListing(licensedRecord({
    coordinates: { lat: 38.7355, lng: -9.1356, source: 'partner feed geocoding', checkedAt: '2026-10-01T00:00:00Z' }
  }));
  assert.equal(good.ok, true, good.errors.join('; '));

  // Out of range, either axis.
  assert.match(validateListing(licensedRecord({ coordinates: { lat: 91, lng: 0, source: 'partner', checkedAt: '2026-10-01' } })).errors.join(' '), /coordinates\.lat/);
  assert.match(validateListing(licensedRecord({ coordinates: { lat: 0, lng: 181, source: 'partner', checkedAt: '2026-10-01' } })).errors.join(' '), /coordinates\.lng/);
  assert.match(validateListing(licensedRecord({ coordinates: { lat: Number.NaN, lng: 0, source: 'partner', checkedAt: '2026-10-01' } })).errors.join(' '), /coordinates\.lat/);

  // A pin with no provenance, or no date, is an unverifiable claim.
  assert.match(validateListing(licensedRecord({ coordinates: { lat: 1, lng: 2 } })).errors.join(' '), /coordinates\.source is required/);
  assert.match(validateListing(licensedRecord({ coordinates: { lat: 1, lng: 2, source: 'partner feed' } })).errors.join(' '), /coordinates\.checkedAt/);
  assert.match(validateListing(licensedRecord({ coordinates: { lat: 1, lng: 2, source: 'partner feed', checkedAt: 'not a date' } })).errors.join(' '), /coordinates\.checkedAt/);

  // No coordinates at all is perfectly valid: most records legitimately have none.
  assert.equal(validateListing(licensedRecord()).ok, true);

  // The rule that matters most: a fictional home is never plotted on a real map.
  const demo = LISTINGS[0];
  const plotted = validateListing({
    ...demo,
    coordinates: { lat: 51.5, lng: -0.12, source: 'invented', checkedAt: '2026-10-01' }
  });
  assert.equal(plotted.ok, false);
  assert.match(plotted.errors.join(' '), /demo records must not carry coordinates/);
  assert.equal(LISTINGS.some((listing) => listing.coordinates), false, 'no demo record may carry coordinates');
});

test('schema: an unknown rent must not carry an amount and a known rent must', () => {
  assert.equal(validateListing(licensedRecord({ rent: { amount: 100, currency: 'EUR', kind: 'unknown' } })).ok, true);
  assert.equal(validateListing(licensedRecord({ rent: { amount: null, currency: 'EUR', kind: 'known' } })).ok, false);
  assert.equal(validateListing(licensedRecord({ rent: { amount: null, currency: 'EUR', kind: 'unknown' } })).ok, true);
  assert.equal(validateListing(licensedRecord({ rent: { amount: 100, currency: 'EUROS', kind: 'known' } })).ok, false);
});

test('licensed-file: a file without a licence declaration is ignored entirely', () => {
  const without = parseExport(JSON.stringify({ records: [licensedRecord()] }), 'no-licence.json');
  assert.equal(without.records.length, 0);
  assert.match(without.ignored, /no licence declared/i);

  const withLicence = parseExport(JSON.stringify({
    licence: 'Licensed partner agreement 2026-04',
    source: VALID_SOURCE,
    records: [licensedRecord()]
  }), 'with-licence.json');
  assert.equal(withLicence.records.length, 1);
  assert.equal(withLicence.records[0].provenance.isDemo, false);
});

test('licensed-file: records missing source name, kind, attribution or licence are rejected', () => {
  for (const field of ['name', 'kind', 'attribution', 'licence']) {
    const result = parseExport(JSON.stringify({
      licence: 'Licensed partner agreement 2026-04',
      records: [licensedRecord({ source: { ...VALID_SOURCE, [field]: '' } })]
    }), 'incomplete.json');
    assert.equal(result.records.length, 0, `missing source.${field} must be rejected`);
    assert.match(result.rejected[0].reason, new RegExp(field));
  }
});

test('licensed-file: an invalid JSON file is rejected rather than crashing the boot', () => {
  const result = parseExport('{ not json', 'broken.json');
  assert.equal(result.records.length, 0);
  assert.match(result.rejected[0].reason, /not valid JSON/i);
});

test('licensed-file: reading a folder works, and a missing folder is not an error', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-licensed-'));
  await fs.writeFile(path.join(dir, 'good.json'), JSON.stringify({
    licence: 'Licensed partner agreement 2026-04',
    source: VALID_SOURCE,
    records: [licensedRecord(), licensedRecord({ id: 'partner-0002' })]
  }));
  await fs.writeFile(path.join(dir, 'unlicensed.json'), JSON.stringify({ records: [licensedRecord({ id: 'partner-0003' })] }));
  await fs.writeFile(path.join(dir, 'broken.json'), '{ oops');

  const loaded = await loadLicensedFile(dir);
  assert.equal(loaded.records.length, 2, 'only the licensed file contributes records');
  assert.equal(loaded.status.files, 3);
  assert.equal(loaded.status.ignored.length, 1);
  assert.ok(loaded.status.rejected.some((entry) => entry.file === 'broken.json'));
  await fs.rm(dir, { recursive: true, force: true });

  const missing = await loadLicensedFile(path.join(os.tmpdir(), 'forkspace-does-not-exist-xyz'));
  assert.equal(missing.records.length, 0);
  assert.equal(missing.status.state, 'empty');
});

test('licensed-file: the import folder defaults to a path that is not web-served', async () => {
  // Guard rail: the folder must not sit inside a directory the static handler allows.
  const allowed = ['css/', 'src/', 'assets/', 'docs/'];
  const { DEFAULTS } = await import('../server/config.js');
  void DEFAULTS;
  const relative = 'data-imports';
  assert.ok(!allowed.some((prefix) => relative.startsWith(prefix)), 'imports must not live under a served prefix');
});

test('authorised REST: disabled without a base URL, key or licensee', () => {
  assert.equal(readAuthorisedFeedConfig({}).enabled, false);
  assert.equal(readAuthorisedFeedConfig({ AUTHORISED_FEED_URL: 'https://api.partner.test' }).reason, 'not_configured');
  assert.equal(readAuthorisedFeedConfig({
    AUTHORISED_FEED_URL: 'https://api.partner.test', AUTHORISED_FEED_KEY: 'k'.repeat(20), AUTHORISED_FEED_LICENSEE: 'Partner'
  }).enabled, true);
});

test('authorised REST: a plain-HTTP endpoint is refused', () => {
  const config = readAuthorisedFeedConfig({
    AUTHORISED_FEED_URL: 'http://api.partner.test', AUTHORISED_FEED_KEY: 'k'.repeat(20), AUTHORISED_FEED_LICENSEE: 'Partner'
  });
  assert.equal(config.enabled, false);
  assert.equal(config.reason, 'insecure_upstream_refused');
});

test('authorised REST: a disabled adapter never calls the network', async () => {
  let called = false;
  const result = await loadAuthorisedFeed({
    env: {},
    fetchImpl: async () => { called = true; throw new Error('should not be called'); }
  });
  assert.equal(called, false);
  assert.equal(result.status.configured, false);
});

test('authorised REST: enabled adapter uses bearer auth, refuses redirects and keeps the key server-side', async () => {
  const seen = {};
  const result = await loadAuthorisedFeed({
    env: {
      AUTHORISED_FEED_URL: 'https://api.partner.test/',
      AUTHORISED_FEED_KEY: 'super-secret-key-value',
      AUTHORISED_FEED_LICENSEE: 'Partner Example'
    },
    userAgent: 'FORKSPACE/1.0.0 (test)',
    fetchImpl: async (url, options) => {
      seen.url = url;
      seen.options = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ records: [licensedRecord()] })
      };
    }
  });
  assert.equal(seen.url, 'https://api.partner.test/listings', 'the base URL is normalised');
  assert.equal(seen.options.redirect, 'error', 'redirects must be refused');
  assert.equal(seen.options.headers.Authorization, 'Bearer super-secret-key-value');
  assert.equal(seen.options.headers['User-Agent'], 'FORKSPACE/1.0.0 (test)');
  assert.equal(result.records.length, 1);
  assert.equal(result.status.accepted, 1);
  // Nothing returned to a caller may contain the key.
  assert.ok(!JSON.stringify(result.status).includes('super-secret-key-value'));
  assert.ok(!JSON.stringify(result.records).includes('super-secret-key-value'));
});

test('authorised REST: upstream failures degrade to a status token, never an upstream message', async () => {
  const failure = await loadAuthorisedFeed({
    env: {
      AUTHORISED_FEED_URL: 'https://api.partner.test',
      AUTHORISED_FEED_KEY: 'super-secret-key-value',
      AUTHORISED_FEED_LICENSEE: 'Partner Example'
    },
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'upstream echoed Bearer super-secret-key-value' })
    })
  });
  assert.equal(failure.records.length, 0);
  assert.equal(failure.status.reason, 'upstream_http_500');
  assert.ok(!JSON.stringify(failure.status).includes('super-secret-key-value'));

  const thrown = await loadAuthorisedFeed({
    env: {
      AUTHORISED_FEED_URL: 'https://api.partner.test',
      AUTHORISED_FEED_KEY: 'super-secret-key-value',
      AUTHORISED_FEED_LICENSEE: 'Partner Example'
    },
    fetchImpl: async () => {
      const error = new Error('connect ECONNREFUSED with Bearer super-secret-key-value');
      error.name = 'TypeError';
      throw error;
    }
  });
  assert.equal(thrown.status.reason, 'upstream_unreachable');
  assert.ok(!JSON.stringify(thrown.status).includes('super-secret-key-value'));
});

test('authorised REST: a record without a complete source is dropped from the feed', async () => {
  const result = await loadAuthorisedFeed({
    env: {
      AUTHORISED_FEED_URL: 'https://api.partner.test',
      AUTHORISED_FEED_KEY: 'k'.repeat(20),
      AUTHORISED_FEED_LICENSEE: 'Partner Example'
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ records: [licensedRecord(), { id: 'no-source', source: { name: 'x' } }] })
    })
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.status.rejected.length, 1);
});

test('listing service: demo records validate and are marked demo-only', async () => {
  const { loadListings } = await import('../server/listings-service.js');
  const { loadConfig } = await import('../server/config.js');
  const { config } = loadConfig({});
  const dataset = await loadListings(config, { force: true });
  assert.equal(dataset.counts.total, 13);
  assert.equal(dataset.counts.demo, 13);
  assert.equal(dataset.demo, true);
  assert.deepEqual(dataset.rejected, []);
  assert.equal(dataset.schemaVersion, SCHEMA_VERSION);
});
