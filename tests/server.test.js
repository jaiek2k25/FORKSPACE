/**
 * Server tests: the static allowlist, traversal, method refusal, API shapes,
 * health, cache headers, and the promise that no configured value ever appears
 * in a response.
 *
 * A real server is started on an ephemeral port with deliberately broken-looking
 * secrets in the environment, so the "no key in any response" check is not a
 * theoretical one.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../server/config.js';
import { createApp } from '../server/index.js';
import { resolveStaticPath, ALLOWED_PREFIXES, ALLOWED_FILES } from '../server/static-files.js';
import { RateLimiter, createLimiters } from '../server/rate-limit.js';

const NVIDIA_SECRET = 'nvapi-TESTONLY-0123456789abcdefghij';
const GOOGLE_SECRET = 'AIzaSyTESTONLY0123456789abcdefghij';

let base;
let shutdown;

function config(overrides = {}) {
  return loadConfig({
    PORT: '0',
    NODE_ENV: 'test',
    NVIDIA_API_KEY: NVIDIA_SECRET,
    GOOGLE_MAPS_API_KEY: GOOGLE_SECRET,
    GEOCODER_CONTACT: 'ops@forkspace.test',
    ...overrides
  }).config;
}

before(async () => {
  const app = createApp(config());
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  base = `http://127.0.0.1:${address.port}`;
  shutdown = () => new Promise((resolve) => app.server.close(resolve));
});

after(async () => {
  await shutdown?.();
});

async function get(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let json = null;
  if ((response.headers.get('content-type') || '').includes('json') && text) {
    json = JSON.parse(text);
  }
  return { response, text, json };
}

test('health: reports status, version and uptime, and says whether AI and maps are configured', async () => {
  const { response, json } = await get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(json.status, 'ok');
  assert.equal(json.version, '1.0.0');
  assert.ok(Number.isInteger(json.uptimeSeconds));
  assert.equal(json.ai.configured, true);
  assert.equal(json.ai.adapter, 'model');
  assert.equal(json.maps.configured, true);
  assert.equal(json.maps.provider, 'nominatim');
  assert.equal(json.listings.count, 13);
  assert.equal(json.listings.demoOnly, true);
  assert.equal(json.schemaVersion, '1.1.0');
  // Values are never reported.
  const payload = JSON.stringify(json);
  assert.ok(!payload.includes(NVIDIA_SECRET));
  assert.ok(!payload.includes(GOOGLE_SECRET));
  assert.ok(!payload.includes('ops@forkspace.test'));
  assert.ok(!/https?:\/\//.test(payload), 'no URL is reported, because a URL can carry a key');
});

test('listings: the API serves the same records, flagged as demo-only', async () => {
  const { json } = await get('/api/listings');
  assert.equal(json.count, 13);
  assert.equal(json.demoOnly, true);
  assert.equal(json.listings.length, 13);
  for (const listing of json.listings) {
    assert.equal(listing.provenance.isDemo, true);
    assert.equal(listing.source.url, null);
    assert.equal(listing.verification.lastVerifiedAt, null);
  }
  assert.match(json.disclosure, /fictional/i);
});

test('sources: freshness rules and wording rules are stated, and demo rows are unverified', async () => {
  const { json } = await get('/api/sources');
  assert.ok(json.freshnessRules.fresh.includes('7 days'));
  assert.ok(json.freshnessRules.aging.includes('30 days'));
  assert.ok(json.wordingRules.verified.includes('verification timestamp'));
  const demo = json.sources.find((source) => source.id === 'forkspace-demo');
  assert.equal(demo.verificationWording, 'Sample data · not verified');
  assert.equal(demo.freshness.key, 'sample');
  const licensed = json.sources.find((source) => source.id === 'licensed-feed-example');
  assert.equal(licensed.state, 'not_connected');
  assert.equal(licensed.verificationWording, 'Stated, not verified');
  assert.ok(json.photography.count >= 15);
  assert.ok(json.currency.disclosure.includes('not a live rate feed'));
});

test('ai status: the adapter and model are named, and no key is present', async () => {
  const { json, text } = await get('/api/ai/status');
  assert.equal(json.adapter, 'model');
  assert.equal(json.model, 'poolside/laguna-xs-2.1');
  assert.equal(json.modelConfigured, true);
  assert.equal(json.temperature, 0);
  assert.equal(json.maxTokens, 700);
  assert.equal(json.textLimit, 1000);
  assert.ok(!text.includes(NVIDIA_SECRET));
});

test('ai extract: a valid brief returns preferences and never a key', async () => {
  const response = await fetch(`${base}/api/ai/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief: 'furnished one-bedroom in Berlin under €1,800 with a commute under 25 minutes' })
  });
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.ok(json.preferences.bedroomsMin === 1);
  assert.equal(json.preferences.maxRentCurrency, 'EUR');
  assert.ok(json.scoring.includes('computed in code'));
  assert.ok(!JSON.stringify(json).includes(NVIDIA_SECRET));
});

test('ai extract: request validation is explicit about each failure', async () => {
  const post = (bodyText, headers = { 'Content-Type': 'application/json' }) =>
    fetch(`${base}/api/ai/extract`, { method: 'POST', headers, body: bodyText });

  const invalidJson = await post('{ not json');
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, 'invalid_json');

  const missing = await post(JSON.stringify({}));
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'missing_brief');

  const tooLong = await post(JSON.stringify({ brief: 'x'.repeat(1001) }));
  assert.equal(tooLong.status, 400);
  const tooLongBody = await tooLong.json();
  assert.equal(tooLongBody.error.code, 'brief_too_long');
  assert.equal(tooLongBody.error.details.limit, 1000);

  const tooBig = await post(JSON.stringify({ brief: 'ok', padding: 'y'.repeat(5000) }));
  assert.equal(tooBig.status, 413);
  assert.equal((await tooBig.json()).error.code, 'body_too_large');
});

test('ai extract: a GET is refused with 405 and an Allow header', async () => {
  const { response, json } = await get('/api/ai/extract');
  assert.equal(response.status, 405);
  assert.equal(json.error.code, 'method_not_allowed');
  assert.equal(response.headers.get('allow'), 'POST');
});

test('geocode: query validation answers 400 with a reason', async () => {
  const empty = await get('/api/geocode');
  assert.equal(empty.response.status, 400);
  assert.equal(empty.json.error.code, 'missing_query');

  const short = await get('/api/geocode?q=ab');
  assert.equal(short.response.status, 400);
  assert.equal(short.json.error.code, 'query_too_short');

  const long = await get(`/api/geocode?q=${'a'.repeat(201)}`);
  assert.equal(long.response.status, 400);
  assert.equal(long.json.error.code, 'query_too_long');
});

test('geocode: with a contact configured, a valid query reaches the provider shape', async () => {
  // The real provider is not called from tests. The query passes validation and
  // the route returns a structured result or a structured upstream error.
  const { response, json } = await get('/api/geocode?q=Coimbatore');
  assert.ok([200, 502].includes(response.status), `unexpected status ${response.status}`);
  if (response.status === 200) {
    assert.ok(json.attribution.includes('OpenStreetMap'));
    assert.ok(Array.isArray(json.results));
  } else {
    assert.ok(['upstream_unreachable', 'upstream_timeout'].includes(json.error.code));
  }
  assert.ok(!JSON.stringify(json).includes(GOOGLE_SECRET));
});

test('geo status: the policy is published with the endpoint', async () => {
  const { json } = await get('/api/geo/status');
  assert.equal(json.provider, 'nominatim');
  assert.equal(json.enabled, true);
  assert.equal(json.minIntervalMs, 1000);
  assert.equal(json.cacheTtlDays, 30);
  assert.equal(json.attribution, '© OpenStreetMap contributors (ODbL)');
  assert.ok(json.notes.some((note) => /real listing addresses only/i.test(note)));
  assert.ok(!JSON.stringify(json).includes(GOOGLE_SECRET));
});

test('unknown API paths answer JSON 404, never HTML', async () => {
  const { response, json, text } = await get('/api/does-not-exist');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(json.error.code, 'not_found');
  assert.ok(Array.isArray(json.error.details.endpoints));
  assert.ok(!text.includes('<html'));
});

test('no API response ever contains a configured value', async () => {
  const paths = ['/api/health', '/api/sources', '/api/listings', '/api/ai/status', '/api/geo/status', '/api/nope'];
  for (const path of paths) {
    const { text } = await get(path);
    assert.ok(!text.includes(NVIDIA_SECRET), `${path} leaked the NVIDIA key`);
    assert.ok(!text.includes(GOOGLE_SECRET), `${path} leaked the Google key`);
    assert.ok(!text.includes('ops@forkspace.test'), `${path} leaked the geocoder contact`);
  }
});

test('every response carries the security headers, and API responses are not cached', async () => {
  for (const path of ['/', '/css/app.css', '/api/health', '/api/nope']) {
    const { response } = await get(path);
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.ok(!csp.includes('unsafe-inline'), `${path} allows inline script`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
    assert.equal(response.headers.get('strict-transport-security'), null, 'HSTS is off unless HSTS_MAX_AGE is set');
    if (path.startsWith('/api')) {
      assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate', `${path} must not be cached`);
    }
  }
});

test('static: only the allowlisted prefixes and index.html are served', async () => {
  const allowed = [
    ['/', 200],
    ['/index.html', 200],
    ['/css/app.css', 200],
    ['/src/main.js', 200],
    ['/assets/js/app.js', 200],
    ['/assets/photos/coimbatore-street.jpg', 200],
    ['/assets/favicon.svg', 200],
    ['/docs/', 404] // the folder itself is not a file
  ];
  for (const [path, status] of allowed) {
    const { response } = await get(path);
    assert.equal(response.status, status, `${path} should answer ${status}`);
  }

  for (const prefix of ALLOWED_PREFIXES) {
    assert.ok(prefix.endsWith('/'), 'prefixes are directory scoped');
  }
  assert.deepEqual(ALLOWED_FILES, ['index.html']);
});

test('static: server code, data, tests, tools, package.json, README and .env are all 404', async () => {
  const blocked = [
    '/server/index.js', '/server/config.js', '/server/ai.js',
    '/tests/logic.test.js', '/tools/prepare-photos.mjs', '/tools/local-chromium.mjs',
    '/package.json', '/package-lock.json', '/README.md', '/.env', '/.env.example',
    '/.gitignore', '/Dockerfile', '/playwright.config.js', '/node_modules/jsdom/package.json',
    '/data-imports/partner.json', '/tools/raw-photos/x.jpg', '/tools/open-data/ons.csv'
  ];
  for (const path of blocked) {
    const { response } = await get(path);
    assert.equal(response.status, 404, `${path} must not be served`);
  }
});

test('static: traversal is refused after normalisation', async () => {
  for (const path of [
    '/../package.json',
    '/../../etc/passwd',
    '/css/../../package.json',
    '/css/%2e%2e/%2e%2e/package.json',
    '/assets/%2e%2e/server/config.js',
    '/docs/..%2f..%2fpackage.json',
    '/%2e%2e%2fpackage.json'
  ]) {
    const { response } = await get(path);
    assert.equal(response.status, 404, `${path} must not resolve`);
  }
  // The resolver itself never escapes the root, whatever it is handed.
  const root = '/srv/forkspace';
  for (const candidate of ['/../etc/passwd', '/css/../../../etc/passwd', '/assets/../../secret.txt']) {
    assert.equal(resolveStaticPath(root, candidate), null);
  }
  assert.equal(resolveStaticPath(root, '/css/app.css'), `${root}/css/app.css`);
  assert.equal(resolveStaticPath(root, '/index.html'), `${root}/index.html`);
  assert.equal(resolveStaticPath(root, '/package.json'), null);
  assert.equal(resolveStaticPath(root, '/'), null);
});

test('static: write methods are refused and never touch the file system', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(`${base}/index.html`, { method });
    assert.equal(response.status, 405, `${method} must be refused`);
    const json = await response.json();
    assert.equal(json.error.code, 'method_not_allowed');
    assert.match(json.error.message, /read-only/i);
  }
  const head = await fetch(`${base}/index.html`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '', 'HEAD sends no body');
});

test('rate limiting: each route has its own bucket, and the window resets', () => {
  let clock = 0;
  const limiter = new RateLimiter({ windowMs: 60_000, max: 3, name: 'test', now: () => clock });
  assert.equal(limiter.check('client').allowed, true);
  assert.equal(limiter.check('client').allowed, true);
  const third = limiter.check('client');
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  const fourth = limiter.check('client');
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.retryAfterSeconds, 60);
  assert.equal(limiter.check('other-client').allowed, true, 'another client has its own bucket');
  clock += 60_000;
  assert.equal(limiter.check('client').allowed, true, 'a new window resets the count');
  assert.ok(limiter.size >= 1);
  assert.equal(limiter.sweep(), 1, 'the idle bucket for "other-client" is swept first');
  clock += 120_000;
  limiter.check('client');
  assert.equal(limiter.sweep(), 0, 'the freshly used bucket is still inside its window');
  clock += 120_000;
  assert.equal(limiter.sweep(), 1, 'and is swept once its window has passed');
});

test('rate limiting: the AI and geocode buckets are separate', () => {
  const { config: loaded } = loadConfig({});
  const limiters = createLimiters(loaded);
  assert.equal(limiters.ai.max, 20);
  assert.equal(limiters.geocode.max, 30);
  for (let i = 0; i < 20; i += 1) assert.equal(limiters.ai.check('c').allowed, true);
  assert.equal(limiters.ai.check('c').allowed, false);
  assert.equal(limiters.geocode.check('c').allowed, true, 'the geocode bucket is untouched by AI traffic');
});

test('rate limiting: the AI route answers 429 once its budget is spent', async () => {
  const app = createApp(config());
  const limiters = createLimiters(app.geocoder ? { ai: { ratePerMinute: 2 }, geo: { ratePerMinute: 30 } } : {});
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  // Swap in a limiter with a tiny budget, then drive the route.
  const { RateLimiter: Limiter } = await import('../server/rate-limit.js');
  app.limiters.ai = new Limiter({ windowMs: 60_000, max: 2, name: 'ai-test' });
  limiters.ai.sweep();

  const url = `http://127.0.0.1:${app.server.address().port}/api/ai/extract`;
  const send = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: 'Berlin two bedroom' }) });
  assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 200);
  const third = await send();
  assert.equal(third.status, 429);
  const body = await third.json();
  assert.equal(body.error.code, 'rate_limited');
  assert.ok(body.error.details.retryAfterSeconds >= 1);
  await new Promise((resolve) => app.server.close(resolve));
});
