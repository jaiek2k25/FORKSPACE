/**
 * JSON API.
 *
 * Every response is no-store, carries the standard security headers, and is
 * plain JSON. Unknown /api paths answer with a JSON 404: an API must never
 * return HTML, and it must never fall through to the static handler.
 */
import { VERSION } from './config.js';
import { loadListings } from './listings-service.js';
import { SOURCES } from '../assets/js/data/sources.js';
import { sourceFreshness } from '../assets/js/lib/freshness.js';
import { PHOTOS, photosByLicence, PHOTO_DISCLOSURE } from '../assets/js/data/photos.js';
import { duplicateSummary } from '../assets/js/lib/duplicates.js';
import { SCHEMA_VERSION } from '../assets/js/data/schema.js';
import { BENCHMARKS } from '../assets/js/data/benchmarks.js';
import { BUDGET_NOTE } from './notes.js';
import { sendJson, sendError, readBody, parseJson, methodNotAllowed } from './http-kit.js';
import { CACHE_NO_STORE } from './security.js';
import { clientKey } from './rate-limit.js';
import { logger } from './logger.js';

const startedAt = Date.now();

function apiHeaders(config, extra = {}) {
  return {
    'Cache-Control': CACHE_NO_STORE,
    ...extra
  };
}

async function handleHealth(ctx) {
  const dataset = await loadListings(ctx.config);
  sendJson(ctx.res, 200, {
    status: 'ok',
    version: VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    environment: ctx.config.nodeEnv,
    ai: {
      configured: ctx.config.ai.enabled,
      adapter: ctx.config.ai.enabled ? 'model' : 'mock'
    },
    maps: {
      configured: ctx.config.geo.enabled,
      provider: ctx.config.geo.provider
    },
    listings: {
      count: dataset.counts.total,
      demoOnly: dataset.counts.demo === dataset.counts.total
    },
    schemaVersion: SCHEMA_VERSION,
    timestamp: new Date().toISOString()
  }, apiHeaders(ctx.config));
}

async function handleSources(ctx) {
  const dataset = await loadListings(ctx.config);
  const now = Date.now();
  const sources = SOURCES.map((source) => {
    const freshness = sourceFreshness(source, now);
    return {
      id: source.id,
      name: source.name,
      publisher: source.publisher || null,
      kind: source.kind,
      state: source.state,
      url: source.url || null,
      attribution: source.attribution || null,
      licence: source.licence,
      licenceUrl: source.licenceUrl || null,
      termsUrl: source.termsUrl || null,
      lastCheckedAt: source.lastCheckedAt || null,
      checkedDaysAgo: freshness.days ?? null,
      freshness: { key: freshness.key, label: freshness.label, explanation: freshness.explanation },
      verificationWording: source.lastCheckedAt
        ? `Verified · ${source.verifiedBy || 'method recorded'}`
        : source.kind === 'demo'
          ? 'Sample data · not verified'
          : 'Stated, not verified',
      usedFor: source.usedFor,
      caveat: source.caveat,
      attributionRequired: Boolean(source.attributionRequired)
    };
  });

  sendJson(ctx.res, 200, {
    generatedAt: new Date(now).toISOString(),
    freshnessRules: {
      fresh: 'Verified 7 days ago or less',
      aging: 'Verified 8 to 30 days ago',
      stale: 'Verified more than 30 days ago',
      unavailable: 'Listing is let or withdrawn, so freshness does not apply',
      sample: 'Demo data',
      unverified: 'No timestamp exists'
    },
    wordingRules: {
      verified: 'Used only where a verification timestamp exists',
      statedNotVerified: 'Used when a source gave no verification timestamp',
      demo: '“Sample data · not verified” for every demo record'
    },
    sources,
    adapters: dataset.adapters,
    duplicates: (() => {
      const summary = duplicateSummary(dataset.listings);
      return { exact: summary.exact, probable: summary.probable, possible: summary.possible, mergeable: summary.mergeable, reported: summary.reported };
    })(),
    photography: {
      count: Object.keys(PHOTOS).length,
      disclosure: PHOTO_DISCLOSURE,
      licenceNote: 'CC0, CC BY, CC BY-SA and public domain only. No NC and no ND material is used.',
      byLicence: photosByLicence().map((group) => ({ licence: group.licence, count: group.photos.length }))
    },
    openData: Object.values(BENCHMARKS).map((benchmark) => ({
      id: benchmark.id,
      publisher: benchmark.publisher,
      series: benchmark.series,
      licence: benchmark.licence,
      available: benchmark.available,
      referencePeriod: benchmark.referencePeriod || null,
      releasedAt: benchmark.releasedAt || null,
      sourceUrl: benchmark.sourceUrl || null,
      caveats: benchmark.caveats
    })),
    currency: BUDGET_NOTE
  }, apiHeaders(ctx.config));
}

async function handleListings(ctx) {
  const dataset = await loadListings(ctx.config);
  sendJson(ctx.res, 200, {
    schemaVersion: dataset.schemaVersion,
    generatedAt: dataset.generatedAt,
    demoOnly: dataset.counts.demo === dataset.counts.total,
    count: dataset.listings.length,
    counts: dataset.counts,
    importStatus: dataset.adapters,
    disclosure: dataset.counts.demo === dataset.counts.total
      ? 'Every record here is fictional sample data written for this prototype. No address, rent or home is real, and no record carries a source URL or a verification timestamp.'
      : 'This dataset mixes fictional sample records with imported licensed records. Check each record’s provenance block before relying on it.',
    listings: dataset.listings
  }, apiHeaders(ctx.config));
}

function handleAiStatus(ctx) {
  sendJson(ctx.res, 200, ctx.ai.status(), apiHeaders(ctx.config));
}

async function handleAiExtract(ctx) {
  if (ctx.req.method !== 'POST') return methodNotAllowed(ctx.res, ['POST']);

  const limit = ctx.limiters.ai.check(clientKey(ctx.req, { trustProxy: ctx.config.trustProxy }));
  if (!limit.allowed) {
    return sendError(ctx.res, 429, 'rate_limited', `Too many research requests. Try again in ${limit.retryAfterSeconds} seconds.`, { retryAfterSeconds: limit.retryAfterSeconds }, apiHeaders(ctx.config));
  }

  const body = await readBody(ctx.req, ctx.config.ai.bodyLimit);
  if (!body.ok) {
    const message = body.code === 'body_too_large'
      ? `The request body must be at most ${ctx.config.ai.bodyLimit} bytes.`
      : 'The request body could not be read.';
    return sendError(ctx.res, body.status, body.code, message, undefined, apiHeaders(ctx.config));
  }

  const parsed = parseJson(body.text);
  if (!parsed.ok) {
    return sendError(ctx.res, 400, 'invalid_json', 'Send a JSON body of the form { "brief": "…" }.', undefined, apiHeaders(ctx.config));
  }
  const brief = parsed.value?.brief;
  if (typeof brief !== 'string' || brief.trim().length === 0) {
    return sendError(ctx.res, 400, 'missing_brief', 'Include a "brief" string describing the home you want.', undefined, apiHeaders(ctx.config));
  }
  if (brief.length > ctx.config.ai.textLimit) {
    return sendError(ctx.res, 400, 'brief_too_long', `The brief must be at most ${ctx.config.ai.textLimit} characters.`, { limit: ctx.config.ai.textLimit, received: brief.length }, apiHeaders(ctx.config));
  }

  try {
    const result = await ctx.ai.extract(brief);
    sendJson(ctx.res, 200, {
      ...result,
      briefLength: brief.length,
      // Scoring happens in the browser from the same records, so the server
      // states the contract explicitly rather than implying it did the analysis.
      scoring: 'Preferences only. Matching, scoring, costs and explanations are computed in code from the records, never by the model.',
      disclosure: 'Preferences are read from the fictional sample dataset. This endpoint does not search the internet and does not contact landlords.'
    }, apiHeaders(ctx.config));
  } catch (error) {
    logger.error('research assistant route failed', error?.message || 'unknown error');
    sendError(ctx.res, 500, 'internal_error', 'The research assistant could not complete this request.', undefined, apiHeaders(ctx.config));
  }
}

function handleGeoStatus(ctx) {
  sendJson(ctx.res, 200, ctx.geocoder.status(), apiHeaders(ctx.config));
}

async function handleGeocode(ctx) {
  const limit = ctx.limiters.geocode.check(clientKey(ctx.req, { trustProxy: ctx.config.trustProxy }));
  if (!limit.allowed) {
    return sendError(ctx.res, 429, 'rate_limited', `Too many geocoding requests. Try again in ${limit.retryAfterSeconds} seconds.`, { retryAfterSeconds: limit.retryAfterSeconds }, apiHeaders(ctx.config));
  }
  const query = ctx.url.searchParams.get('q');
  const result = await ctx.geocoder.geocode(query);
  if (!result.ok) {
    return sendError(ctx.res, result.status, result.code, result.message, undefined, apiHeaders(ctx.config));
  }
  sendJson(ctx.res, 200, result.data, apiHeaders(ctx.config));
}

const ROUTES = [
  { method: 'GET', path: '/api/health', handler: handleHealth },
  { method: 'GET', path: '/api/sources', handler: handleSources },
  { method: 'GET', path: '/api/listings', handler: handleListings },
  { method: 'GET', path: '/api/ai/status', handler: handleAiStatus },
  { method: 'POST', path: '/api/ai/extract', handler: handleAiExtract },
  { method: 'GET', path: '/api/geo/status', handler: handleGeoStatus },
  { method: 'GET', path: '/api/geocode', handler: handleGeocode }
];

export async function handleApi(ctx) {
  const { pathname } = ctx.url;
  const route = ROUTES.find((candidate) => candidate.path === pathname);

  if (!route) {
    return sendError(ctx.res, 404, 'not_found', `No API endpoint matches ${pathname}.`, { endpoints: ROUTES.map((candidate) => `${candidate.method} ${candidate.path}`) }, apiHeaders(ctx.config));
  }
  if (ctx.req.method !== route.method) {
    return sendError(ctx.res, 405, 'method_not_allowed', `Use ${route.method} for ${pathname}.`, { allowed: [route.method] }, { ...apiHeaders(ctx.config), Allow: route.method });
  }
  return route.handler(ctx);
}

export { ROUTES };
