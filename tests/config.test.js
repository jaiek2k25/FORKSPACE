/**
 * Configuration tests: defaults, validation, the promise that no secret appears
 * in any message, and the proxy and HSTS settings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { loadConfig, describeConfig, DEFAULTS, VERSION } from '../server/config.js';
import { parseEnv, loadEnvFile } from '../server/env.js';
import { redact } from '../server/logger.js';
import { securityHeaders } from '../server/security.js';

const SECRET = 'nvapi-TESTKEYNOTREAL-0123456789abcdef';
const GOOGLE = 'AIzaSyTESTKEYNOTREAL1234567890';

test('defaults: a clean environment produces a valid, complete configuration', () => {
  const { config, errors, warnings } = loadConfig({});
  assert.deepEqual(errors, []);
  assert.equal(config.port, DEFAULTS.PORT);
  assert.equal(config.port, 5173);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.trustProxy, false);
  assert.equal(config.hstsMaxAge, 0);
  assert.equal(config.ai.enabled, false);
  assert.equal(config.ai.model, 'poolside/laguna-xs-2.1');
  assert.equal(config.ai.baseUrl, 'https://integrate.api.nvidia.com/v1');
  assert.equal(config.ai.temperature, 0);
  assert.equal(config.ai.maxTokens, 700);
  assert.equal(config.ai.bodyLimit, 4096);
  assert.equal(config.ai.textLimit, 1000);
  assert.equal(config.ai.ratePerMinute, 20);
  assert.equal(config.geo.ratePerMinute, 30);
  assert.equal(config.geo.minIntervalMs, 1000);
  assert.equal(config.geo.cacheTtlMs, 30 * 86_400_000);
  assert.equal(config.geo.provider, 'nominatim');
  assert.equal(config.geo.enabled, false, 'no contact means the proxy is off by default');
  assert.equal(config.limits.headersTimeoutMs, 15000);
  assert.equal(config.limits.requestTimeoutMs, 30000);
  assert.equal(VERSION, '1.0.0');
});

test('defaults: missing keys and a missing contact warn, and do not stop start-up', () => {
  const { errors, warnings } = loadConfig({});
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((warning) => /NVIDIA_API_KEY/.test(warning)));
  assert.ok(warnings.some((warning) => /GEOCODER_CONTACT/.test(warning)));
});

test('validation: an invalid PORT refuses start-up', () => {
  for (const port of ['abc', '0', '70000', '-1', '5173.5']) {
    const { errors } = loadConfig({ PORT: port });
    assert.ok(errors.some((error) => error.field === 'PORT'), `PORT=${port} must be refused`);
  }
  assert.deepEqual(loadConfig({ PORT: '8080' }).errors, []);
});

test('validation: a non-HTTPS upstream URL refuses start-up', () => {
  for (const field of ['NVIDIA_BASE_URL', 'NOMINATIM_BASE_URL', 'GOOGLE_GEOCODE_URL']) {
    const { errors } = loadConfig({ [field]: 'http://insecure.example/v1' });
    assert.ok(errors.some((error) => error.field === field), `${field} must be refused over HTTP`);
    assert.equal((loadConfig({}).errors.find((error) => error.field === field)), undefined);
  }
  assert.deepEqual(loadConfig({ NVIDIA_BASE_URL: 'https://ok.example/v1' }).errors, []);
});

test('validation: an invalid GEOCODER or HSTS_MAX_AGE refuses start-up', () => {
  assert.ok(loadConfig({ GEOCODER: 'bing' }).errors.some((error) => error.field === 'GEOCODER'));
  assert.ok(loadConfig({ HSTS_MAX_AGE: '-5' }).errors.some((error) => error.field === 'HSTS_MAX_AGE'));
  assert.ok(loadConfig({ HSTS_MAX_AGE: 'soon' }).errors.some((error) => error.field === 'HSTS_MAX_AGE'));
  assert.deepEqual(loadConfig({ HSTS_MAX_AGE: '15552000', GEOCODER: 'google', GOOGLE_MAPS_API_KEY: GOOGLE }).errors, []);
});

test('secrets: no message, log line or error ever contains a configured value', () => {
  const env = {
    PORT: 'not-a-port',
    NVIDIA_API_KEY: SECRET,
    GOOGLE_MAPS_API_KEY: GOOGLE,
    GEOCODER_CONTACT: 'ops@example.test',
    NVIDIA_BASE_URL: 'http://insecure.example/v1',
    HSTS_MAX_AGE: 'nope'
  };
  const result = loadConfig(env);
  assert.ok(result.errors.length >= 3, 'this environment is broken on purpose');

  const everything = JSON.stringify({
    errors: result.errors,
    warnings: result.warnings,
    description: describeConfig(result)
  });
  assert.ok(!everything.includes(SECRET), 'the NVIDIA key must never appear');
  assert.ok(!everything.includes(GOOGLE), 'the Google key must never appear');
  assert.ok(!everything.includes('insecure.example/v1'), 'URL values are not printed either, because they can carry a key');

  // The redactor is the second line of defence for anything else that is logged.
  assert.ok(!redact(`upstream said: ${SECRET}`).includes(SECRET));
  assert.ok(!redact(`token=${GOOGLE}`).includes(GOOGLE));
});

test('secrets: the runtime secret holder is non-enumerable, so serialising config cannot leak it', () => {
  const { config } = loadConfig({ NVIDIA_API_KEY: SECRET, GOOGLE_MAPS_API_KEY: GOOGLE });
  assert.equal(config.runtimeSecrets.nvidiaApiKey, SECRET, 'the server can still read it');
  const json = JSON.stringify(config);
  assert.ok(!json.includes(SECRET));
  assert.ok(!json.includes(GOOGLE));
  assert.deepEqual(Object.keys(config).filter((key) => /secret|key/i.test(key)), ['secrets']);
  assert.equal(JSON.stringify(config.secrets).includes(SECRET), false);
  assert.equal(config.secrets.hasNvidiaKey, true);
});

test('proxy: X-Forwarded-For is only trusted when TRUST_PROXY=1', async () => {
  const { clientKey } = await import('../server/rate-limit.js');
  const request = { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.5' } };
  assert.equal(clientKey(request, { trustProxy: false }), '10.0.0.5', 'the socket address wins by default');
  assert.equal(clientKey(request, { trustProxy: true }), '203.0.113.9', 'the first forwarded address is used when trusted');
  assert.equal(loadConfig({ TRUST_PROXY: '1' }).config.trustProxy, true);
  assert.equal(loadConfig({ TRUST_PROXY: '0' }).config.trustProxy, false);
  assert.equal(loadConfig({}).config.trustProxy, false);
});

test('HSTS: the header is emitted only when HSTS_MAX_AGE is configured', () => {
  assert.equal('Strict-Transport-Security' in securityHeaders({ hstsMaxAge: 0 }), false);
  const withHsts = securityHeaders({ hstsMaxAge: 15552000 });
  assert.equal(withHsts['Strict-Transport-Security'], 'max-age=15552000; includeSubDomains');
  assert.equal(securityHeaders({ hstsMaxAge: 15552000 }).hasOwnProperty('Strict-Transport-Security'), true);
});

test('security headers: always present, and API responses are never cached', () => {
  const doc = securityHeaders({});
  assert.match(doc['Content-Security-Policy'], /script-src 'self'/);
  assert.ok(!/unsafe-inline/.test(doc['Content-Security-Policy']), 'no inline scripts anywhere');
  assert.equal(doc['X-Content-Type-Options'], 'nosniff');
  assert.equal(doc['Referrer-Policy'], 'no-referrer');
  assert.match(doc['Permissions-Policy'], /camera=\(\)/);
  assert.match(doc['Permissions-Policy'], /geolocation=\(\)/);
  assert.match(doc['Permissions-Policy'], /microphone=\(\)/);
  assert.equal('Cache-Control' in doc, false, 'documents are not forced to no-store');

  const api = securityHeaders({ api: true });
  assert.equal(api['Cache-Control'], 'no-store, no-cache, must-revalidate');
});

test('.env loader: values already set in the environment always win', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-env-'));
  const file = path.join(dir, '.env');
  await fs.writeFile(file, [
    '# a comment',
    'PORT=9999',
    'export TRUST_PROXY=1',
    'QUOTED="a value with spaces"',
    "SINGLE='another value'",
    'EMPTY=',
    'NOT A KEY',
    'ALREADY_SET=from-file'
  ].join('\n'));

  const env = { PORT: '1234', ALREADY_SET: 'from-environment' };
  const applied = loadEnvFile(file, env);
  assert.equal(env.PORT, '1234', 'an existing variable is never overridden');
  assert.equal(env.ALREADY_SET, 'from-environment');
  assert.equal(env.TRUST_PROXY, '1');
  assert.equal(env.QUOTED, 'a value with spaces');
  assert.equal(env.SINGLE, 'another value');
  assert.equal(env.EMPTY, '');
  assert.equal('NOT A KEY' in env, false);
  assert.ok(!applied.includes('PORT'));
  assert.ok(applied.includes('TRUST_PROXY'));
  await fs.rm(dir, { recursive: true, force: true });
});

test('.env loader: a missing file is not an error', async () => {
  const env = {};
  const applied = loadEnvFile(path.join(os.tmpdir(), 'forkspace-no-such-env-file'), env);
  assert.deepEqual(applied, []);
  assert.deepEqual(env, {});
});

test('.env parser: quoting, comments and malformed lines are handled', () => {
  const parsed = parseEnv([
    '# comment',
    '',
    '  SPACED_KEY = value  ',
    'NO_EQUALS_SIGN',
    '2INVALID=value',
    'GOOD=ok'
  ].join('\n'));
  assert.equal(parsed.GOOD, 'ok');
  assert.equal(parsed.SPACED_KEY, 'value', 'surrounding whitespace around a key is trimmed');
  assert.equal('NO_EQUALS_SIGN' in parsed, false);
  assert.equal('2INVALID' in parsed, false);
});

test('configuration: the .env file is git-ignored and an example is provided', async () => {
  const root = new URL('..', import.meta.url).pathname;
  const ignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env$/m, '.env must be ignored');
  assert.match(ignore, /^!\.env\.example$/m, '.env.example must be kept');
  assert.match(ignore, /data-imports\//, 'the licensed import folder must be ignored');

  const example = await fs.readFile(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /NVIDIA_API_KEY=/);
  assert.match(example, /GEOCODER_CONTACT=/);
  assert.match(example, /TRUST_PROXY=/);
  assert.match(example, /HSTS_MAX_AGE=/);
  assert.ok(!/nvapi-/.test(example), 'the example file must not contain a real key');
});

test('configuration: the licensed data folder defaults outside the served prefixes', () => {
  const { config } = loadConfig({});
  const relative = path.relative(config.root, config.licensedDataDir);
  assert.equal(relative.startsWith('..'), false);
  for (const served of ['css', 'src', 'assets', 'docs']) {
    assert.ok(!relative.startsWith(served), `imports must not sit under ${served}/`);
  }
  assert.equal(relative, 'data-imports');
});

test('configuration: describeConfig names settings without printing values', () => {
  const { config } = loadConfig({ NVIDIA_API_KEY: SECRET, GEOCODER_CONTACT: 'ops@example.test', TRUST_PROXY: '1', HSTS_MAX_AGE: '600' });
  const lines = describeConfig({ config, errors: [], warnings: [] }).join('\n');
  assert.match(lines, /research assistant: model adapter configured/);
  assert.match(lines, /geocoder: nominatim · enabled/);
  assert.match(lines, /trust proxy: on/);
  assert.match(lines, /HSTS: on/);
  assert.ok(!lines.includes(SECRET));
  assert.ok(!lines.includes('ops@example.test'), 'even the contact is not printed in the summary');
});
