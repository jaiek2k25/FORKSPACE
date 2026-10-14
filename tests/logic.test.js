/**
 * Logic tests: filters, sort, cost totals, duplicate detection, freshness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { LISTINGS } from '../assets/js/data/listings.js';
import { locationOf, hasLocation, locationSourceLine } from '../assets/js/lib/map.js';
import { cityCentre, CITY_CENTRE_DISCLOSURE, CITY_CENTRES_DATED } from '../assets/js/data/city-centres.js';
import {
  DEFAULT_FILTERS, filterListings, sortListings, sortByRelevance, relevanceScore,
  activeChips, filtersToParams, parseFilters, rentInInr, displayBudget, budgetNote, hardLimitFailures
} from '../assets/js/lib/filters.js';
import { buildCostBreakdown, costSummary, costRows } from '../assets/js/lib/costs.js';
import { classifyPair, detectDuplicates, duplicateSummary, similarity, normaliseText } from '../assets/js/lib/duplicates.js';
import { freshnessOf, verificationLine, sourceFreshness, FRESHNESS } from '../assets/js/lib/freshness.js';
import { convert, toInr, fromInr } from '../assets/js/data/fx.js';

const DEFAULTS = { ...DEFAULT_FILTERS };

test('dataset: 13 fictional listings across 12 cities, every one a sample record', () => {
  assert.equal(LISTINGS.length, 13);
  assert.equal(new Set(LISTINGS.map((l) => l.cityId)).size, 12);
  for (const listing of LISTINGS) {
    assert.equal(listing.provenance.isDemo, true, `${listing.id} must be a demo record`);
    // Statuses are varied on purpose (a let home, an under-application home, a
    // withdrawn home) so the interface is exercised. What must never vary is
    // that every one of them is flagged as sample data.
    assert.ok(['sample', 'pending', 'let', 'withdrawn'].includes(listing.status), `${listing.id} has an unexpected status`);
    assert.equal(freshnessOf(listing).key, FRESHNESS.SAMPLE, `${listing.id} must read as sample data`);
    assert.equal(listing.source.url, null, `${listing.id} must not carry a source URL`);
    assert.equal(listing.verification.lastVerifiedAt, null, `${listing.id} must not carry a verification timestamp`);
  }
});

test('currencies: nine currencies, each formatted in its own locale', () => {
  const codes = new Set(LISTINGS.map((l) => l.rent.currency));
  assert.deepEqual([...codes].sort(), ['AED', 'AUD', 'CAD', 'EUR', 'GBP', 'INR', 'JPY', 'MXN', 'USD']);
});

test('filters: an empty filter set returns everything', () => {
  const { results, matched } = filterListings(LISTINGS, DEFAULTS);
  assert.equal(matched, 13);
  assert.equal(results.length, 13);
});

test('filters: city, type, bedrooms, furnishing and lease all narrow the set', () => {
  assert.equal(filterListings(LISTINGS, { ...DEFAULTS, cities: ['coimbatore'] }).matched, 2);
  assert.equal(filterListings(LISTINGS, { ...DEFAULTS, types: ['apartment'] }).matched,
    LISTINGS.filter((l) => l.propertyType === 'apartment').length);
  assert.equal(filterListings(LISTINGS, { ...DEFAULTS, bedroomsMin: 3 }).matched,
    LISTINGS.filter((l) => l.bedrooms >= 3).length);
  assert.equal(filterListings(LISTINGS, { ...DEFAULTS, furnishing: ['furnished'] }).matched,
    LISTINGS.filter((l) => l.furnishing === 'furnished').length);
  assert.equal(filterListings(LISTINGS, { ...DEFAULTS, leaseMonthsMin: 24 }).matched,
    LISTINGS.filter((l) => l.leaseMonths >= 24).length);
});

test('filters: the semi-furnished option also accepts "upholstered" records', () => {
  const { results } = filterListings(LISTINGS, { ...DEFAULTS, furnishing: ['semi-furnished'] });
  const ids = results.map((l) => l.id);
  assert.ok(ids.includes('coim-01'), 'semi-furnished apartment should match');
  assert.ok(ids.includes('ams-01'), 'upholstered (gestoffeerd) record should match the semi-furnished filter');
});

test('filters: free text matches city, area, title and tags case-insensitively', () => {
  assert.ok(relevanceScore(LISTINGS.find((l) => l.id === 'lis-01'), 'LISBON') > 0);
  assert.ok(relevanceScore(LISTINGS.find((l) => l.id === 'nyc-01'), 'park slope') > 0);
  assert.ok(relevanceScore(LISTINGS.find((l) => l.id === 'dxb-01'), 'marina') > 0);
  assert.equal(relevanceScore(LISTINGS.find((l) => l.id === 'lis-01'), 'reykjavik'), 0);
  assert.equal(filterListings(LISTINGS, { ...DEFAULTS, q: 'reykjavik' }).matched, 0);
});

test('filters: budget excludes, and reports the reason, including for an unknown rent', () => {
  const limited = filterListings(LISTINGS, { ...DEFAULTS, rentMaxInr: 30000 });
  assert.ok(limited.matched > 0);
  for (const listing of limited.results) {
    const inr = rentInInr(listing);
    assert.ok(inr !== null && inr <= 30000, `${listing.id} should be within budget`);
  }
  const reasons = limited.excludedByBudget.map((entry) => entry.reason);
  assert.ok(reasons.every((reason) => typeof reason === 'string' && reason.length > 0));
  // The Dubai record states no rent, so it can never be shown to fit a budget.
  assert.ok(limited.excludedByBudget.some((entry) => entry.listing.id === 'dxb-01' && /not stated/i.test(entry.reason)));
});

test('filters: budgets are stored in INR and converted for display with the stated note', () => {
  assert.equal(displayBudget(100000, 'INR'), 100000);
  const inEur = displayBudget(100000, 'EUR');
  assert.equal(inEur, Math.round(fromInr(100000, 'EUR')));
  assert.match(budgetNote('INR', 'EUR'), /illustrative static FX table/);
  assert.match(budgetNote('INR', 'INR'), /stored and shown in INR/);
  assert.ok(Math.abs(convert(1000, 'USD', 'USD') - 1000) < 1e-9);
});

test('filters: URL round trip preserves every filter', () => {
  const filters = {
    ...DEFAULTS,
    q: 'walkable', cities: ['london', 'berlin'], types: ['apartment'], bedroomsMin: 2,
    rentMinInr: 50000, rentMaxInr: 400000, displayCurrency: 'EUR', furnishing: ['furnished'],
    leaseMonthsMin: 12, statuses: ['sample'], amenities: ['Lift']
  };
  const params = filtersToParams(filters, 'price-asc');
  const parsed = parseFilters(params);
  assert.deepEqual(parsed, filters);
  assert.equal(params.get('sort'), 'price-asc');
});

test('filters: chips describe every active filter and can be counted', () => {
  const chips = activeChips({ ...DEFAULTS, q: 'tokyo', cities: ['tokyo'], bedroomsMin: 1, rentMaxInr: 200000 }, () => 'X');
  assert.deepEqual(chips.map((chip) => chip.key).sort(), ['bedroomsMin', 'cities', 'q', 'rentMaxInr']);
  assert.equal(activeChips(DEFAULTS).length, 0);
});

test('sort: price ascending puts the cheapest first and unknown rents last', () => {
  const sorted = sortListings(LISTINGS, 'price-asc');
  const prices = sorted.map((l) => rentInInr(l));
  assert.ok(prices[prices.length - 1] === null, 'a record with no rent must sort last');
  const known = prices.filter((value) => value !== null);
  for (let i = 1; i < known.length; i += 1) assert.ok(known[i] >= known[i - 1], 'ascending order');
});

test('sort: price descending keeps unknown rents last rather than treating them as zero', () => {
  const sorted = sortListings(LISTINGS, 'price-desc');
  assert.equal(sorted[sorted.length - 1].rent.kind, 'unknown');
  const known = sorted.filter((l) => l.rent.kind !== 'unknown').map((l) => rentInInr(l));
  for (let i = 1; i < known.length; i += 1) assert.ok(known[i] <= known[i - 1], 'descending order');
});

test('sort: beds, city and relevance are deterministic', () => {
  assert.deepEqual(sortListings(LISTINGS, 'beds-desc').map((l) => l.id), sortListings(LISTINGS, 'beds-desc').map((l) => l.id));
  const byCity = sortListings(LISTINGS, 'city-asc').map((l) => l.city);
  assert.deepEqual([...byCity].sort((a, b) => a.localeCompare(b)), byCity);
  const relevant = sortByRelevance(LISTINGS, 'furnished walkable');
  assert.ok(relevant[0].relevance >= relevant[relevant.length - 1].relevance);
});

test('maps: a location is only used when it is checked, sourced and not fictional', () => {
  const real = { id: 'r-1', provenance: { isDemo: false }, coordinates: { lat: 52.4875, lng: 13.4244, source: 'partner feed geocoding', checkedAt: '2026-10-01T00:00:00Z' } };
  assert.equal(hasLocation(real), true);
  assert.deepEqual(
    { lat: locationOf(real).lat, lng: locationOf(real).lng, source: locationOf(real).source },
    { lat: 52.4875, lng: 13.4244, source: 'partner feed geocoding' }
  );
  assert.match(locationSourceLine(locationOf(real)), /supplied by partner feed geocoding, checked 1 October 2026/);

  // Every one of these must fail closed, even if a record reaches the view by a route
  // that skipped validation.
  const rejected = [
    { ...real, provenance: { isDemo: true } },                                   // fictional
    { ...real, coordinates: { ...real.coordinates, lat: 95 } },                  // out of range
    { ...real, coordinates: { ...real.coordinates, lng: -181 } },                // out of range
    { ...real, coordinates: { ...real.coordinates, lat: '52.4' } },              // not a number
    { ...real, coordinates: { ...real.coordinates, source: undefined } },        // no provenance
    { ...real, coordinates: { ...real.coordinates, checkedAt: undefined } },     // no date
    { ...real, coordinates: null },
    { ...real, coordinates: undefined },
    {}
  ];
  for (const listing of rejected) {
    assert.equal(locationOf(listing), null, `${JSON.stringify(listing.coordinates)} must not be plotted`);
    assert.equal(hasLocation(listing), false);
  }

  // The demo dataset is entirely unplottable, which is the point.
  assert.equal(LISTINGS.some(hasLocation), false);

  // Empty text rather than a broken sentence.
  assert.equal(locationSourceLine(null), '');
});

test('maps: every city in the dataset has a plotted centre, and none claims precision', () => {
  const cityIds = [...new Set(LISTINGS.map((listing) => listing.cityId))];
  assert.ok(cityIds.length >= 12);
  for (const id of cityIds) {
    const centre = cityCentre(id);
    assert.ok(centre, `${id} needs a centre so the map view never falls back silently`);
    assert.ok(centre.lat >= -90 && centre.lat <= 90, `${id} lat`);
    assert.ok(centre.lng >= -180 && centre.lng <= 180, `${id} lng`);
    // Rounded to three decimals: a map centre is not a survey.
    for (const value of [centre.lat, centre.lng]) {
      assert.equal(Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-9, true, `${id} must stay rounded`);
    }
    assert.ok(typeof centre.name === 'string' && centre.name.length > 2, `${id} names the part of town`);
  }
  assert.equal(cityCentre('reykjavik'), null, 'an unknown city has no centre and no map');
  assert.match(CITY_CENTRE_DISCLOSURE, /not the location of any home/);
  assert.equal(CITY_CENTRES_DATED, '2026-10-14', 'the table carries the date it was recorded');
});

test('sort: a home that is gone never sorts above a live one on equal footing', () => {
  // Availability is a tiebreaker only: it must not override the chosen sort key.
  const byPrice = sortListings(LISTINGS, 'price-asc').map((l) => l.id);
  const cheap = sortListings(LISTINGS, 'price-asc').findIndex((l) => l.status === 'let');
  assert.ok(cheap >= 0, 'the let record is still listed, it is never hidden');

  // On records that tie on the sort key, live homes come first, in rank order.
  const tied = [
    { id: 'd', status: 'withdrawn', bedrooms: 2, city: 'X', rent: { kind: 'known', amount: 100, currency: 'EUR' } },
    { id: 'b', status: 'available', bedrooms: 2, city: 'X', rent: { kind: 'known', amount: 100, currency: 'EUR' } },
    { id: 'c', status: 'let', bedrooms: 2, city: 'X', rent: { kind: 'known', amount: 100, currency: 'EUR' } },
    { id: 'a', status: 'pending', bedrooms: 2, city: 'X', rent: { kind: 'known', amount: 100, currency: 'EUR' } }
  ];
  assert.deepEqual(sortListings(tied, 'relevance').map((l) => l.id), ['b', 'a', 'c', 'd']);
  assert.deepEqual(sortListings(tied, 'beds-desc').map((l) => l.id), ['b', 'a', 'c', 'd']);
  assert.deepEqual(sortListings(tied, 'city-asc').map((l) => l.id), ['b', 'a', 'c', 'd']);

  // Availability must never override the visitor's chosen sort key.
  const cheapest = [...LISTINGS].sort((a, b) => (a.rent.amount ?? Infinity) - (b.rent.amount ?? Infinity))[0];
  assert.equal(sortListings(LISTINGS, 'relevance')[0].status === 'let', false);

  const all = sortListings(LISTINGS, 'relevance');
  assert.equal(all.length, LISTINGS.length, 'sorting must never drop a record');
  assert.deepEqual(new Set(byPrice).size, 13);
});

test('costs: every row carries a kind, and unknown rows carry no amount', () => {
  for (const listing of LISTINGS) {
    for (const row of costRows(listing)) {
      assert.ok(['known', 'estimate', 'unknown'].includes(row.kind), `${listing.id} ${row.label}`);
      if (row.kind === 'unknown') assert.equal(row.amount, null, `${listing.id} ${row.label} must have no amount`);
      else assert.ok(Number.isFinite(row.amount) || row.amount === 0, `${listing.id} ${row.label} needs a number`);
    }
  }
});

test('costs: totals add known and estimated amounts only, never unknown ones', () => {
  const listing = LISTINGS.find((l) => l.id === 'coim-01');
  const breakdown = buildCostBreakdown(listing);
  const knownSum = breakdown.upfront.known.reduce((sum, row) => sum + row.amount, 0);
  assert.equal(breakdown.upfront.knownTotal, knownSum);
  assert.equal(breakdown.upfront.unknown.every((row) => row.amount === null), true);
  // The unknown brokerage must not appear in either total.
  assert.ok(breakdown.upfront.unknown.some((row) => row.label === 'Brokerage'));
  assert.equal(breakdown.upfront.unknownTotal, undefined);
  assert.equal(breakdown.upfront.knownTotal + breakdown.upfront.estimateTotal,
    breakdown.upfront.knownTotal + breakdown.upfront.estimates.reduce((sum, row) => sum + row.amount, 0));
});

test('costs: a record with no stated rent produces no invented totals', () => {
  const listing = LISTINGS.find((l) => l.id === 'dxb-01');
  const breakdown = buildCostBreakdown(listing);
  assert.equal(breakdown.rent.kind, 'unknown');
  assert.equal(breakdown.rent.amount, null);
  assert.ok(breakdown.caveats.some((caveat) => /rent itself is not stated/i.test(caveat)));
  const summary = costSummary(listing);
  assert.equal(summary.monthlyKnown, breakdown.monthly.knownTotal);
  assert.ok(summary.monthlyTotalsAreIncomplete);
});

test('costs: monthly known total includes the rent but the rent panel never double counts the deposit', () => {
  const listing = LISTINGS.find((l) => l.id === 'blr-01');
  const breakdown = buildCostBreakdown(listing);
  const rentRow = breakdown.monthly.known.find((row) => row.id === 'rent');
  assert.equal(rentRow.amount, listing.rent.amount);
  assert.ok(!breakdown.monthly.known.some((row) => /deposit/i.test(row.label)), 'deposits are one-off, not monthly');
  assert.ok(breakdown.upfront.known.some((row) => /deposit/i.test(row.label)));
});

test('duplicates: exact match on provider record id or identical source URL', () => {
  const a = { ...LISTINGS[0], id: 'x1', provenance: { ...LISTINGS[0].provenance, providerRecordId: 'ABC-1' } };
  const b = { ...LISTINGS[3], id: 'x2', provenance: { ...LISTINGS[3].provenance, providerRecordId: 'ABC-1' } };
  const result = classifyPair(a, b);
  assert.equal(result.kind, 'exact');
  assert.match(result.reasons.join(' '), /provider record id/i);

  const withUrl = { ...a, source: { ...a.source, url: 'https://example.test/1' } };
  const sameUrl = { ...b, source: { ...b.source, url: 'https://example.test/1' } };
  assert.equal(classifyPair(withUrl, sameUrl).kind, 'exact');
});

test('duplicates: probable requires city, area, type, beds, rent within 2% and a title match', () => {
  const base = LISTINGS.find((l) => l.id === 'lis-01');
  const twin = {
    ...base,
    id: 'lis-01-copy',
    title: 'Two-bedroom with azulejo façade near Areeiro',
    rent: { ...base.rent, amount: Math.round(base.rent.amount * 1.015) },
    provenance: { ...base.provenance, providerRecordId: 'OTHER-1' }
  };
  const result = classifyPair(base, twin);
  assert.equal(result.kind, 'probable');
  assert.ok(result.reasons.some((reason) => /within 2%/i.test(reason)));

  const tooDifferent = { ...twin, rent: { ...twin.rent, amount: base.rent.amount * 1.5 } };
  assert.equal(classifyPair(base, tooDifferent).kind, null);
});

test('duplicates: possible matches are reported and never merged', () => {
  const base = LISTINGS.find((l) => l.id === 'blr-01');
  const neighbour = {
    ...base,
    id: 'blr-01-n',
    area: 'Domlur',
    title: 'Different building entirely',
    address: 'Another street',
    rent: { ...base.rent, amount: Math.round(base.rent.amount * 1.04) },
    provenance: { ...base.provenance, providerRecordId: 'OTHER-2' }
  };
  const result = classifyPair(base, neighbour);
  assert.equal(result.kind, 'possible');
  const summary = duplicateSummary([base, neighbour]);
  assert.equal(summary.possible, 1);
  assert.equal(summary.mergeable, 0, 'a possible match must never be treated as mergeable');
  assert.equal(detectDuplicates([base, neighbour]).probable.length, 0);
});

test('duplicates: records without a stated rent are never compared on price', () => {
  const dubai = LISTINGS.find((l) => l.id === 'dxb-01');
  const other = LISTINGS.find((l) => l.id === 'nyc-01');
  assert.equal(classifyPair(dubai, other).kind, null);
  assert.equal(classifyPair(dubai, { ...dubai, id: 'dubai-copy' }).kind, 'exact');
});

test('duplicates: text similarity ignores stop words and accents', () => {
  assert.equal(normaliseText('Rua  Inventada, 42!'), 'rua inventada 42');
  assert.ok(similarity('Two-bedroom apartment in Lisbon', 'Two bedroom apartment, Lisbon') > 0.6);
  assert.equal(similarity('', 'anything'), 0);
});

test('freshness: sample, fresh, aging, stale, unavailable and unverified', () => {
  const now = Date.parse('2026-10-14T00:00:00Z');
  const sample = LISTINGS[0];
  assert.equal(freshnessOf(sample, now).key, FRESHNESS.SAMPLE);
  assert.equal(verificationLine(sample, now), 'Sample data · not verified');
  assert.equal(freshnessOf(sample, now).verified, false);

  const fresh = { status: 'available', verification: { lastVerifiedAt: '2026-10-12T00:00:00Z', method: 'agent call' } };
  assert.equal(freshnessOf(fresh, now).key, FRESHNESS.FRESH);
  assert.match(verificationLine(fresh, now), /^Fresh · Verified 2 days ago · method: agent call$/);

  assert.equal(freshnessOf({ ...fresh, verification: { lastVerifiedAt: '2026-09-30T00:00:00Z' } }, now).key, FRESHNESS.AGING);
  assert.equal(freshnessOf({ ...fresh, verification: { lastVerifiedAt: '2026-08-01T00:00:00Z' } }, now).key, FRESHNESS.STALE);
  assert.equal(freshnessOf({ status: 'let', verification: { lastVerifiedAt: '2026-10-13T00:00:00Z' } }, now).key, FRESHNESS.UNAVAILABLE);
  assert.equal(freshnessOf({ status: 'withdrawn', verification: {} }, now).key, FRESHNESS.UNAVAILABLE);

  // Demo records read as sample data even when their fictional status is "let".
  assert.equal(freshnessOf({ status: 'let', provenance: { isDemo: true }, verification: {} }, now).key, FRESHNESS.SAMPLE);

  const unverified = { status: 'available', verification: { lastVerifiedAt: null }, provenance: { isDemo: false } };
  assert.equal(freshnessOf(unverified, now).key, FRESHNESS.UNVERIFIED);
  assert.equal(verificationLine(unverified, now), 'Stated, not verified');
});

test('freshness: the word "Verified" only appears when a timestamp exists', () => {
  const now = Date.now();
  for (const listing of LISTINGS) {
    const line = verificationLine(listing, now);
    assert.ok(!/^Verified/.test(line), 'a sample record must never start with "Verified"');
    assert.ok(!/\bverified\b/i.test(line) || /not verified/i.test(line), `unexpected wording: ${line}`);
  }
});

test('freshness: boundaries sit at 7 and 30 days', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const day = 86_400_000;
  const at = (days) => ({ status: 'available', verification: { lastVerifiedAt: new Date(now - days * day).toISOString() } });
  assert.equal(freshnessOf(at(7), now).key, FRESHNESS.FRESH);
  assert.equal(freshnessOf(at(8), now).key, FRESHNESS.AGING);
  assert.equal(freshnessOf(at(30), now).key, FRESHNESS.AGING);
  assert.equal(freshnessOf(at(31), now).key, FRESHNESS.STALE);
});

test('freshness: source rows follow the same rules', () => {
  const now = Date.parse('2026-10-14T00:00:00Z');
  assert.equal(sourceFreshness({ lastCheckedAt: '2026-10-14T00:00:00Z' }, now).key, FRESHNESS.FRESH);
  assert.equal(sourceFreshness({ lastCheckedAt: '2026-10-01T00:00:00Z' }, now).key, FRESHNESS.AGING);
  assert.equal(sourceFreshness({ lastCheckedAt: '2026-08-01T00:00:00Z' }, now).key, FRESHNESS.STALE);
  assert.equal(sourceFreshness({ kind: 'demo', state: 'sample' }, now).key, FRESHNESS.SAMPLE);
  assert.equal(sourceFreshness({ kind: 'api', lastCheckedAt: null }, now).key, FRESHNESS.UNVERIFIED);
});

test('hard limits: excluded homes carry a reason, and an unknown rent always fails a rent limit', () => {
  const failures = hardLimitFailures(LISTINGS.find((l) => l.id === 'dxb-01'), { maxRentInr: 10_000_000 });
  assert.equal(failures.length, 1);
  assert.match(failures[0].reason, /not stated/i);

  const cityFailure = hardLimitFailures(LISTINGS.find((l) => l.id === 'lis-01'), { cities: ['tokyo'] });
  assert.equal(cityFailure[0].field, 'city');

  const sold = hardLimitFailures(LISTINGS.find((l) => l.id === 'coim-02'), {});
  assert.ok(sold.some((failure) => failure.field === 'status'));

  assert.deepEqual(hardLimitFailures(LISTINGS.find((l) => l.id === 'lis-01'), {}), []);
});

test('fx: conversions are symmetric and never invent a value for an unknown currency', () => {
  const eur = toInr(1450, 'EUR');
  assert.ok(Math.abs(fromInr(eur, 'EUR') - 1450) < 1e-6);
  assert.equal(convert(100, 'XXX', 'EUR'), null);
  assert.equal(convert(Number.NaN, 'EUR', 'INR'), null);
});
