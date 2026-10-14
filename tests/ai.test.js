/**
 * Research-assistant tests.
 *
 * The point of this file is to prove the model is treated as untrusted input:
 * junk is discarded, values are clamped, nothing is invented, and an unknown is
 * never scored as met.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalisePreferences, extractPreferences, researchReport, briefToLimits,
  PREFERENCE_FIELDS, WALKABLE_ESTIMATE_THRESHOLD, BRIEF_LIMIT
} from '../assets/js/lib/research.js';
import { parseModelJson, createAiAdapter, MODEL_SYSTEM_PROMPT, BLOCKED_MODELS } from '../server/ai.js';
import { loadConfig, DEFAULTS } from '../server/config.js';
import { LISTINGS } from '../assets/js/data/listings.js';

test('normalisation: unknown fields are discarded, never stored', () => {
  const { preferences, dropped } = normalisePreferences({
    city: 'Lisbon',
    maxRentAmount: 1600,
    maxRentCurrency: 'eur',
    bedroomsMin: 2,
    propertyType: 'apartment',
    furnished: true,
    walkable: true,
    scoredWinner: 'lis-01',
    priceIsFair: true,
    __proto__: { polluted: true },
    confidence: 0.99,
    rankingTable: [{ id: 'lis-01', score: 99 }]
  });
  assert.deepEqual(Object.keys(preferences).sort(), ['bedroomsMin', 'city', 'furnished', 'maxRentAmount', 'maxRentCurrency', 'propertyType', 'walkable']);
  assert.ok(dropped.includes('scoredWinner'));
  assert.ok(dropped.includes('rankingTable'));
  assert.equal(preferences.maxRentCurrency, 'EUR', 'a lowercase currency code is normalised');
});

test('normalisation: values are clamped instead of trusted', () => {
  const { preferences } = normalisePreferences({
    bedroomsMin: 99,
    maxRentAmount: -50,
    leaseMonthsMin: 5000,
    commuteMaxMinutes: 9000,
    propertyType: 'castle',
    maxRentCurrency: 'XYZ',
    notes: 'x'.repeat(5000),
    mustHaveAmenities: Array.from({ length: 50 }, (_, i) => `thing-${i}`)
  });
  assert.equal(preferences.bedroomsMin, undefined);
  assert.equal(preferences.maxRentAmount, undefined);
  assert.equal(preferences.leaseMonthsMin, undefined);
  assert.equal(preferences.commuteMaxMinutes, undefined);
  assert.equal(preferences.propertyType, undefined);
  assert.equal(preferences.maxRentCurrency, undefined);
  assert.ok(preferences.notes.length <= 500);
  assert.equal(preferences.mustHaveAmenities.length, 12);
});

test('normalisation: junk types never crash and never produce a preference', () => {
  for (const input of [null, undefined, 42, 'a string', [], [{ city: 'Lisbon' }], true]) {
    const { preferences } = normalisePreferences(input);
    assert.deepEqual(preferences, {});
  }
  const { preferences } = normalisePreferences({ cities: 'Lisbon', mustHaveAmenities: 'lift', furnished: 'yes' });
  assert.deepEqual(preferences, {}, 'wrong types are dropped, not coerced');
});

test('model output: JSON is extracted only when it really is a JSON object', () => {
  assert.deepEqual(parseModelJson('{"city":"Berlin"}').value, { city: 'Berlin' });
  assert.deepEqual(parseModelJson('```json\n{"city":"Berlin"}\n```').value, { city: 'Berlin' });
  assert.deepEqual(parseModelJson('Here you go:\n{"city":"Berlin"}\nHope that helps').value, { city: 'Berlin' });

  assert.equal(parseModelJson('').ok, false);
  assert.equal(parseModelJson('I cannot help with that.').ok, false);
  assert.equal(parseModelJson('[1,2,3]').ok, false);
  assert.equal(parseModelJson('{"city":').ok, false);
  assert.equal(parseModelJson(null).ok, false);
});

test('model output: a fenced object containing prose fields still only yields known fields', () => {
  const parsed = parseModelJson('```json\n{"city":"Tokyo","think":"the user probably wants cheap","score":91}\n```');
  const { preferences, dropped } = normalisePreferences(parsed.value);
  assert.deepEqual(preferences, { city: 'Tokyo' });
  assert.ok(dropped.includes('think'));
  assert.ok(dropped.includes('score'));
});

test('mock path: the deterministic reader understands a rough brief', () => {
  const brief = 'furnished one-bedroom in a walkable neighbourhood under €1,600 with a commute under 30 minutes';
  const { preferences, understood } = extractPreferences(brief, { listings: LISTINGS });
  assert.equal(preferences.bedroomsMin, 1);
  assert.equal(preferences.furnished, true);
  assert.equal(preferences.walkable, true);
  assert.equal(preferences.maxRentAmount, 1600);
  assert.equal(preferences.maxRentCurrency, 'EUR');
  assert.equal(preferences.commuteMaxMinutes, 30);
  assert.equal(understood.currencyStated, 'EUR');
});

test('mock path: "one-bedroom" is never read as a single room in a shared flat', () => {
  const { preferences } = extractPreferences('furnished one-bedroom flat in Lisbon', { listings: LISTINGS });
  assert.equal(preferences.propertyType, 'apartment');
  assert.notEqual(preferences.propertyType, 'room');
});

test('mock path: a mentioned-but-unspecified commute is recorded as a gap, not a number', () => {
  const { preferences } = extractPreferences('somewhere with a reasonable commute', { listings: LISTINGS });
  assert.equal(preferences.commuteMaxMinutes, null);
});

test('mock path: no brief produces no invented requirements', () => {
  const { preferences } = extractPreferences('', { listings: LISTINGS });
  assert.equal(preferences.city, undefined);
  assert.equal(preferences.maxRentAmount, undefined);
  assert.equal(preferences.bedroomsMin, undefined);
  assert.equal(preferences.commuteMaxMinutes, undefined);
});

test('hard limits: failing homes are excluded and each exclusion states a reason', () => {
  const preferences = normalisePreferences({ city: 'london', propertyType: 'apartment', bedroomsMin: 2, maxRentAmount: 2000, maxRentCurrency: 'GBP' }).preferences;
  const report = researchReport({ brief: 'two bedrooms in London under £2,000', preferences, listings: LISTINGS, adapter: 'mock' });
  assert.equal(report.counts.considered, 13);
  assert.ok(report.counts.excluded > 0);
  for (const entry of report.excluded) {
    assert.ok(entry.reasons.length > 0, `${entry.listing.id} must state why it was excluded`);
    assert.ok(entry.reasons.every((reason) => reason.trim().length > 0));
  }
  assert.ok(!report.matches.some((entry) => entry.listing.cityId !== 'london'), 'no non-London home may be scored');
});

test('hard limits: an unknown rent is excluded rather than assumed to fit', () => {
  const preferences = normalisePreferences({ maxRentAmount: 9_000_000, maxRentCurrency: 'INR' }).preferences;
  const report = researchReport({ brief: 'under ₹90,00,000', preferences, listings: LISTINGS, adapter: 'mock' });
  const dubai = report.excluded.find((entry) => entry.listing.id === 'dxb-01');
  assert.ok(dubai, 'the record with no stated rent must be excluded');
  assert.match(dubai.reasons.join(' '), /not stated/i);
  assert.ok(!report.matches.some((entry) => entry.listing.id === 'dxb-01'));
});

test('scoring: unknown is never counted as met', () => {
  const preferences = normalisePreferences({ city: 'coimbatore', mustHaveAmenities: ['a helipad'], commuteMaxMinutes: 5 }).preferences;
  const report = researchReport({ brief: 'coimbatore with a helipad and a 5 minute commute', preferences, listings: LISTINGS, adapter: 'mock' });
  assert.ok(report.matches.length > 0);
  for (const entry of report.matches) {
    const helipad = entry.criteria.find((criterion) => criterion.label.toLowerCase().includes('helipad'));
    assert.equal(helipad.state, 'unknown', 'an amenity nobody named must be unknown, not met');
    assert.ok(!entry.reasons.some((reason) => /helipad/i.test(reason)), 'an unknown must not appear as a reason for a match');
    assert.ok(entry.unknowns.length > 0);
  }
});

test('scoring: a criterion the visitor stated and the record contradicts is "not met"', () => {
  const preferences = normalisePreferences({ city: 'lisbon', furnished: true }).preferences;
  const report = researchReport({ brief: 'furnished in Lisbon', preferences, listings: LISTINGS, adapter: 'mock' });
  const entry = report.matches.find((item) => item.listing.id === 'lis-01');
  assert.ok(entry);
  const furnished = entry.criteria.find((criterion) => criterion.label === 'Furnished');
  assert.equal(furnished.state, 'met');

  const unfurnishedPreference = normalisePreferences({ city: 'lisbon', furnished: false }).preferences;
  const second = researchReport({ brief: 'unfurnished in Lisbon', preferences: unfurnishedPreference, listings: LISTINGS, adapter: 'mock' });
  const lisbonEntry = second.matches.find((item) => item.listing.id === 'lis-01');
  assert.equal(lisbonEntry.criteria.find((criterion) => criterion.label === 'Unfurnished').state, 'not_met');
});

test('scoring: walkability uses the prototype threshold and labels itself an estimate', () => {
  const preferences = normalisePreferences({ walkable: true }).preferences;
  const report = researchReport({ brief: 'walkable', preferences, listings: LISTINGS, adapter: 'mock' });
  for (const entry of report.matches) {
    const criterion = entry.criteria.find((item) => item.label === 'Walkable area');
    if (!criterion) continue;
    const score = entry.listing.walkScore.score;
    assert.equal(criterion.state, score >= WALKABLE_ESTIMATE_THRESHOLD ? 'met' : 'not_met');
    assert.match(criterion.evidence, /estimate/i);
  }
});

test('report: sections are present, and the gaps in the brief are stated', () => {
  const preferences = normalisePreferences({ city: 'berlin' }).preferences;
  const report = researchReport({ brief: 'something in Berlin', preferences, listings: LISTINGS, adapter: 'mock' });
  for (const key of ['requirements', 'matches', 'tradeoffs', 'missingInformation', 'stillMissing', 'questionsToInvestigate', 'comparisonSummary', 'excluded', 'counts']) {
    assert.ok(key in report, `report must include ${key}`);
  }
  assert.ok(report.stillMissing.some((note) => /rent limit/i.test(note)), 'no rent limit was given, so it must be flagged');
  assert.ok(report.stillMissing.some((note) => /commute limit/i.test(note)), 'no commute limit was given, so it must be flagged');
  assert.ok(report.questionsToInvestigate.length >= 5);
});

test('report: no rent limit means nothing is judged on price, and no limit is invented', () => {
  const preferences = normalisePreferences({ city: 'lisbon' }).preferences;
  const report = researchReport({ brief: 'Lisbon please', preferences, listings: LISTINGS, adapter: 'mock' });
  assert.equal(report.limits.maxRentAmount, null);
  assert.equal(report.limits.maxRentInr, null);
  for (const entry of report.matches) {
    assert.ok(!entry.criteria.some((criterion) => /maximum rent/i.test(criterion.label)));
  }
});

test('report: the comparison summary keeps currencies separate and flags estimated parts', () => {
  const preferences = normalisePreferences({ city: 'london', maxRentAmount: 4000, maxRentCurrency: 'GBP' }).preferences;
  const report = researchReport({ brief: 'London under £4,000', preferences, listings: LISTINGS, adapter: 'mock' });
  assert.ok(report.comparisonSummary.rows.length > 0);
  for (const row of report.comparisonSummary.rows) {
    assert.ok(row.currency === 'GBP' || typeof row.currency === 'string');
    assert.ok('monthlyKnown' in row && 'monthlyEstimates' in row);
  }
  assert.match(report.comparisonSummary.note, /never converted/i);
});

test('report: the disclosure never claims a real-world search', () => {
  const preferences = normalisePreferences({ city: 'tokyo' }).preferences;
  const report = researchReport({ brief: 'Tokyo', preferences, listings: LISTINGS, adapter: 'mock' });
  assert.match(report.disclosure, /does not search the internet/i);
  assert.ok(!/searched \d+ (sites|listings)/i.test(JSON.stringify(report)));
});

test('adapter status: the mock adapter names itself and the model it would use', () => {
  const { config } = loadConfig({});
  const adapter = createAiAdapter(config);
  const status = adapter.status();
  assert.equal(status.adapter, 'mock');
  assert.equal(status.model, null);
  assert.equal(status.modelConfigured, false);
  assert.equal(status.temperature, 0);
  assert.equal(status.maxTokens, 700);
  assert.match(status.disclosure, /deterministic demo reader/i);
  assert.deepEqual(status.blockedModels, BLOCKED_MODELS);
});

test('adapter: the configured model is the one requested, never a retired one', () => {
  const { config } = loadConfig({ NVIDIA_API_KEY: 'test-key-not-real-123456', NVIDIA_MODEL: undefined });
  const adapter = createAiAdapter(config);
  const status = adapter.status();
  assert.equal(status.adapter, 'model');
  assert.equal(status.model, DEFAULTS.NVIDIA_MODEL);
  assert.equal(status.model, 'poolside/laguna-xs-2.1');
  assert.ok(!status.model.includes('llama-3.3-70b'), 'the retired model must never be selected');
  assert.ok(!MODEL_SYSTEM_PROMPT.includes('llama'));
});

test('adapter: with no key, extraction makes no network call at all', async () => {
  let called = false;
  const { config } = loadConfig({});
  const adapter = createAiAdapter(config, { fetchImpl: async () => { called = true; } });
  const result = await adapter.extract('furnished one-bedroom under €1,500');
  assert.equal(called, false);
  assert.equal(result.adapter, 'mock');
  assert.equal(result.model, null);
  assert.equal(result.preferences.maxRentAmount, 1500);
  assert.match(result.warning, /no model key/i);
});

test('adapter: an upstream failure falls back to the demo reader without leaking the key', async () => {
  const { config } = loadConfig({ NVIDIA_API_KEY: 'test-key-not-real-abcdef123456' });
  const adapter = createAiAdapter(config, {
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'upstream echoed test-key-not-real-abcdef123456' } })
    })
  });
  const result = await adapter.extract('two bedrooms in Berlin under €2,000');
  assert.equal(result.adapter, 'mock');
  assert.match(result.warning, /could not be used/i);
  const serialised = JSON.stringify(result);
  assert.ok(!serialised.includes('test-key-not-real-abcdef123456'), 'a key must never appear in a result');
});

test('adapter: the model response is validated before it is used', async () => {
  const { config } = loadConfig({ NVIDIA_API_KEY: 'test-key-not-real-abcdef123456' });
  let requestBody = null;
  const adapter = createAiAdapter(config, {
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '```json\n{"city":"Berlin","bedroomsMin":2,"winningListingId":"ber-01","maxRentAmount":2000,"maxRentCurrency":"EUR"}\n```' } }]
        })
      };
    }
  });
  const result = await adapter.extract('Berlin, two bedrooms, €2,000');
  assert.equal(requestBody.temperature, 0);
  assert.equal(requestBody.max_tokens, 700);
  assert.equal(requestBody.model, DEFAULTS.NVIDIA_MODEL);
  assert.equal(result.adapter, 'model');
  assert.equal(result.preferences.bedroomsMin, 2);
  assert.equal(result.preferences.winningListingId, undefined, 'a field asking the model to pick a winner must be discarded');
  assert.ok(result.dropped.includes('winningListingId'));
});

test('adapter: a response that is not JSON falls back to the demo reader', async () => {
  const { config } = loadConfig({ NVIDIA_API_KEY: 'test-key-not-real-abcdef123456' });
  const adapter = createAiAdapter(config, {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Sure! Here is a summary of the Berlin rental market…' } }] }) })
  });
  const result = await adapter.extract('Berlin two bedroom');
  assert.equal(result.adapter, 'mock');
  assert.match(result.warning, /could not be used/i);
});

test('brief limits: 1000 characters is the ceiling the interface and server agree on', () => {
  assert.equal(BRIEF_LIMIT, 1000);
  const long = 'x'.repeat(1500);
  const { preferences } = extractPreferences(long, { listings: LISTINGS });
  assert.deepEqual(preferences, {});
});

test('limits: a brief currency is used for the rent limit and the INR equivalent is derived', () => {
  const preferences = normalisePreferences({ maxRentAmount: 1000, maxRentCurrency: 'GBP', city: 'london' }).preferences;
  const limits = briefToLimits(preferences, LISTINGS);
  assert.equal(limits.maxRentCurrency, 'GBP');
  assert.ok(limits.maxRentInr > 1000 * 100, 'a pound is far more than an INR');
});

test('limits: without a currency, the city currency is assumed and that assumption is stated', () => {
  const preferences = normalisePreferences({ maxRentAmount: 2000, city: 'london' }).preferences;
  const report = researchReport({ brief: 'London under 2000', preferences, listings: LISTINGS, adapter: 'mock', meta: { currencyStated: null } });
  const rentRow = report.requirements.find((row) => row.label === 'Maximum rent');
  assert.equal(rentRow.value.startsWith('GBP'), true);
  assert.match(rentRow.note, /no currency was stated/i);
});

test('limits: a currency the prototype cannot convert is reported, never silently re-read', () => {
  const brief = 'a flat in Lisbon under ISK 200,000';
  const { preferences, understood } = extractPreferences(brief, { listings: LISTINGS });
  assert.equal(understood.unsupportedCurrency, 'ISK');
  assert.equal(understood.unsupportedCurrencyAmount, 200000);
  assert.equal(preferences.maxRentAmount, undefined, 'the amount must not survive without a convertible currency');
  assert.equal(preferences.maxRentCurrency, undefined);

  const report = researchReport({ brief, preferences, listings: LISTINGS, adapter: 'mock', meta: understood });
  assert.equal(report.limits.maxRentAmount, null, 'no rent limit may be applied from a currency we cannot convert');
  assert.ok(report.stillMissing.some((note) => /ISK/.test(note) && /not one of the currencies/i.test(note)));
  const row = report.requirements.find((item) => item.label === 'Maximum rent');
  assert.ok(row, 'the stated budget is still shown, as not applied');
  assert.equal(row.applied, false);
  assert.match(row.note, /not applied/i);
  assert.ok(!report.requirements.some((item) => item.label === 'Maximum rent' && item.value.startsWith('EUR')));
});

test('preference vocabulary is a fixed list', () => {
  assert.ok(PREFERENCE_FIELDS.includes('city'));
  assert.ok(PREFERENCE_FIELDS.includes('maxRentCurrency'));
  assert.ok(!PREFERENCE_FIELDS.includes('score'));
});
