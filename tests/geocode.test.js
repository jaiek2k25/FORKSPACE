/**
 * Geocoding tests: query validation, the Nominatim policy (one request per
 * second, identifying User-Agent, no redirects), the 30-day cache, the Google
 * not-configured response, and the guarantee that no key ever appears in an
 * error.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateQuery, createGeocoder, MinIntervalQueue, TtlCache, OSM_ATTRIBUTION, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } from '../server/geocode.js';
import { loadConfig } from '../server/config.js';

function configFor(env) {
  return loadConfig(env).config;
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('validation: length bounds are enforced with an explicit message', () => {
  assert.equal(validateQuery('').ok, false);
  assert.equal(validateQuery('   ').reason, 'missing_query');
  assert.equal(validateQuery('ab').reason, 'query_too_short');
  assert.equal(validateQuery('a'.repeat(MAX_QUERY_LENGTH + 1)).reason, 'query_too_long');
  assert.equal(validateQuery('a'.repeat(MIN_QUERY_LENGTH)).ok, true);
  assert.equal(validateQuery('a'.repeat(MAX_QUERY_LENGTH)).ok, true);
  assert.equal(validateQuery(undefined).ok, false);
  assert.equal(validateQuery(42).ok, false);
});

test('validation: list-style submissions are refused (no bulk geocoding)', () => {
  assert.equal(validateQuery('Berlin\nTokyo').reason, 'bulk_query_refused');
});

test('policy: one request per second is enforced by spacing, not by hope', async () => {
  // Stubbed clock: no real waiting happens in the test.
  let clock = 1_000_000;
  const slept = [];
  const queue = new MinIntervalQueue(1000, () => clock, async (ms) => {
    slept.push(ms);
    clock += ms;
  });

  const started = [];
  const task = () => async () => { started.push(clock); return 'done'; };

  await queue.run(task());
  await queue.run(task());
  await queue.run(task());

  assert.deepEqual(started, [1_000_000, 1_001_000, 1_002_000]);
  assert.deepEqual(slept, [1000, 1000]);
  assert.equal(queue.waits, 2);
});

test('policy: a queue failure does not jam later requests', async () => {
  let clock = 0;
  const queue = new MinIntervalQueue(1000, () => clock, async (ms) => { clock += ms; });
  await assert.rejects(() => queue.run(async () => { throw new Error('boom'); }));
  const value = await queue.run(async () => 'recovered');
  assert.equal(value, 'recovered');
});

test('cache: results are reused for 30 days and then expire', () => {
  let clock = 0;
  const cache = new TtlCache(30 * 86_400_000, () => clock);
  cache.set('key', { results: [1] });
  assert.deepEqual(cache.get('key'), { results: [1] });
  clock += 29 * 86_400_000;
  assert.ok(cache.get('key'), 'still inside the 30-day window');
  clock += 2 * 86_400_000;
  assert.equal(cache.get('key'), null, 'expired after 30 days');
  assert.equal(cache.size, 0, 'an expired key is removed when it is read');
  assert.equal(cache.sweep(), 0);
});

test('nominatim: the request carries the identifying contact in its User-Agent', async () => {
  const config = configFor({ GEOCODER_CONTACT: 'ops@example.test' });
  assert.equal(config.geo.enabled, true);
  let seen = null;
  const geocoder = createGeocoder(config, {
    fetchImpl: async (url, options) => { seen = { url, options }; return jsonResponse([{ display_name: 'Rua Inventada, Lisboa', lat: '38.7', lon: '-9.1', type: 'house', importance: 0.5 }]); },
    now: () => 0,
    sleep: async () => {}
  });
  const result = await geocoder.geocode('Rua Inventada 42, Lisboa');
  assert.equal(result.ok, true);
  assert.ok(seen.url.startsWith('https://nominatim.openstreetmap.org/search?'), 'the public endpoint is used');
  assert.match(seen.url, /format=jsonv2/);
  assert.match(seen.url, /limit=5/);
  assert.match(seen.options.headers['User-Agent'], /FORKSPACE/);
  assert.match(seen.options.headers['User-Agent'], /ops@example\.test/, 'the contact is present');
  assert.equal(seen.options.redirect, 'error', 'redirects must be refused');
});

test('nominatim: a result always carries the required attribution', async () => {
  const config = configFor({ GEOCODER_CONTACT: 'ops@example.test' });
  const geocoder = createGeocoder(config, { fetchImpl: async () => jsonResponse([]), now: () => 0, sleep: async () => {} });
  const result = await geocoder.geocode('Coimbatore');
  assert.equal(result.data.attribution, OSM_ATTRIBUTION);
  assert.equal(OSM_ATTRIBUTION, '© OpenStreetMap contributors (ODbL)');
  assert.match(result.data.policy, /one request per second/i);
});

test('nominatim: results are cached, so a repeat query does not hit the network again', async () => {
  const config = configFor({ GEOCODER_CONTACT: 'ops@example.test' });
  let calls = 0;
  const geocoder = createGeocoder(config, {
    fetchImpl: async () => { calls += 1; return jsonResponse([{ display_name: 'Berlin', lat: '52.5', lon: '13.4', type: 'city' }]); },
    now: () => 0,
    sleep: async () => {}
  });
  const first = await geocoder.geocode('Berlin');
  const second = await geocoder.geocode('  berlin  ');
  assert.equal(calls, 1, 'a normalised repeat query is served from the cache');
  assert.equal(first.data.cached, false);
  assert.equal(second.data.cached, true);
  assert.equal(geocoder.status().cacheEntries, 1);
});

test('configuration: without a contact the proxy refuses to call the public service', async () => {
  const config = configFor({});
  assert.equal(config.geo.enabled, false);
  let called = false;
  const geocoder = createGeocoder(config, { fetchImpl: async () => { called = true; } });
  const result = await geocoder.geocode('Berlin');
  assert.equal(called, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, 'geocoder_disabled');
  assert.match(result.message, /GEOCODER_CONTACT/);
});

test('configuration: GEOCODER=none switches geocoding off entirely', async () => {
  const config = configFor({ GEOCODER: 'none', GEOCODER_CONTACT: 'ops@example.test' });
  const geocoder = createGeocoder(config, { fetchImpl: async () => { throw new Error('must not be called'); } });
  const result = await geocoder.geocode('Berlin');
  assert.equal(result.code, 'geocoder_disabled');
});

test('google: requested without a key answers 503 not_configured and calls nothing', async () => {
  const config = configFor({ GEOCODER: 'google' });
  let called = false;
  const geocoder = createGeocoder(config, { fetchImpl: async () => { called = true; } });
  const result = await geocoder.geocode('Berlin');
  assert.equal(called, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, 'not_configured');
  assert.match(result.message, /GOOGLE_MAPS_API_KEY|key/i);
  assert.match(result.message, /billing/i);
});

test('google: with a key the call is server-side and the key never appears in the result', async () => {
  const secret = 'AIzaSyTESTKEYNOTREAL1234567890';
  const config = configFor({ GEOCODER: 'google', GOOGLE_MAPS_API_KEY: secret });
  let seenUrl = null;
  const geocoder = createGeocoder(config, {
    fetchImpl: async (url) => {
      seenUrl = url;
      return jsonResponse({ status: 'OK', results: [{ formatted_address: 'Berlin, Germany', geometry: { location: { lat: 52.5, lng: 13.4 }, viewport: { southwest: { lat: 52.3, lng: 13.1 }, northeast: { lat: 52.6, lng: 13.7 } } }, types: ['locality'] }] });
    },
    now: () => 0,
    sleep: async () => {}
  });
  const result = await geocoder.geocode('Berlin');
  assert.ok(seenUrl.includes('maps.googleapis.com'), 'the Google endpoint is used');
  assert.ok(seenUrl.includes(encodeURIComponent(secret)), 'the key is sent from the server');
  const payload = JSON.stringify(result.data);
  assert.ok(!payload.includes(secret), 'the key must never be returned to a client');
  assert.equal(result.data.attribution, 'Geocoding by Google Maps Platform');
  const statusPayload = JSON.stringify(geocoder.status());
  assert.ok(!statusPayload.includes(secret), 'the status payload must not contain the key value');
  // The word "key" may appear in prose ("the API key is held on the server"),
  // but no field may carry a key value.
  const statusObject = geocoder.status();
  for (const [field, value] of Object.entries(statusObject)) {
    if (/key|secret|token/i.test(field)) {
      assert.ok(!value, `status.${field} must not carry a value`);
    }
    assert.notEqual(value, secret, `status.${field} must not be the key`);
  }
});

test('errors: an upstream failure never echoes a key or an upstream body', async () => {
  const secret = 'AIzaSyTESTKEYNOTREAL1234567890';
  const config = configFor({ GEOCODER: 'google', GOOGLE_MAPS_API_KEY: secret });
  const geocoder = createGeocoder(config, {
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error_message: `API key not valid: ${secret}` }) }),
    now: () => 0,
    sleep: async () => {}
  });
  const result = await geocoder.geocode('Berlin');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'upstream_http_403');
  assert.ok(!result.message.includes(secret));
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('errors: a timeout and an unreachable host are reported as fixed tokens', async () => {
  const config = configFor({ GEOCODER_CONTACT: 'ops@example.test' });
  const timedOut = createGeocoder(config, {
    fetchImpl: async () => { const error = new Error('aborted with a secret'); error.name = 'AbortError'; throw error; },
    now: () => 0,
    sleep: async () => {}
  });
  const timeoutResult = await timedOut.geocode('Berlin');
  assert.equal(timeoutResult.code, 'upstream_timeout');
  assert.ok(!timeoutResult.message.includes('secret'));

  const unreachable = createGeocoder(config, {
    fetchImpl: async () => { throw new TypeError('fetch failed for https://user:pass@host'); },
    now: () => 0,
    sleep: async () => {}
  });
  const unreachableResult = await unreachable.geocode('Berlin');
  assert.equal(unreachableResult.code, 'upstream_unreachable');
  assert.ok(!unreachableResult.message.includes('user:pass'));
});

test('status: the geocoder reports its policy, cache size and that demo records are never geocoded', () => {
  const config = configFor({ GEOCODER_CONTACT: 'ops@example.test' });
  const geocoder = createGeocoder(config, { fetchImpl: async () => jsonResponse([]), now: () => 0, sleep: async () => {} });
  const status = geocoder.status();
  assert.equal(status.provider, 'nominatim');
  assert.equal(status.enabled, true);
  assert.equal(status.cacheTtlDays, 30);
  assert.equal(status.minIntervalMs, 1000);
  assert.equal(status.ratePerMinute, 30);
  assert.ok(status.notes.some((note) => /real listing addresses only/i.test(note)));
  assert.ok(status.notes.some((note) => /never scrapes a map service/i.test(note)));
  assert.ok(status.notes.some((note) => /no autocomplete/i.test(note)));
});

test('policy: the endpoint is never used for autocomplete from the browser', async () => {
  // Guard rail for a maintenance mistake: the client module must not call geocode
  // from an input handler. The only permitted call site is an explicit action.
  const { readFileSync } = await import('node:fs');
  const files = [
    'assets/js/views/search.js',
    'assets/js/views/home.js',
    'assets/js/views/property.js',
    'assets/js/views/research.js'
  ];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/geocode\s*\(/.test(text), `${file} must not call the geocoder`);
  }
});
