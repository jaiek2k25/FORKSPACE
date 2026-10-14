/**
 * Generated open-data benchmark module.
 *
 * DO NOT EDIT BY HAND — regenerate with `npm run benchmarks`.
 *
 * Source:  Office for National Statistics, Price Index of Private Rents (PIPR),
 *          published in "Private rent and house prices, UK".
 * Licence: Open Government Licence v3.0.
 * The spreadsheet it is generated from is downloaded by the operator, stored
 * outside the web root and is never served by the application.
 *
 * These are AREA AVERAGES for the whole private rented stock (new and existing
 * tenancies). They are not asking rents, not bedroom-specific, and not a price
 * for any individual home. The interface repeats that wherever they appear.
 */

export const ONS_LONDON = Object.freeze({
  id: 'ons-london',
  label: 'Area benchmark · official statistics',
  available: true,
  publisher: 'Office for National Statistics',
  series: 'Price Index of Private Rents (PIPR)',
  licence: 'Open Government Licence v3.0',
  licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  sourceUrl: 'https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/august2026',
  datasetUrl: 'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
  attribution: 'Source: Office for National Statistics – Price Index of Private Rents, licensed under the Open Government Licence v3.0',
  /** Rent reference period of the figures below. */
  referencePeriod: '2026-07',
  releasedAt: '2026-08-19',
  checkedAt: '2026-10-14T09:15:00.000Z',
  generatedAt: '2026-10-14T09:15:00.000Z',
  generatedBy: 'tools/generate-benchmark.mjs',
  currency: 'GBP',
  locale: 'en-GB',
  figures: {
    londonAverageMonthlyRent: 2317,
    ukAverageMonthlyRent: 1393,
    englandAverageMonthlyRent: 1451
  },
  caveats: [
    'This is an area average across the whole private rented stock, not the asking rent for this home.',
    'It is not split by number of bedrooms or property type, so it cannot be compared directly with a one-bedroom flat.',
    'It covers all tenancies, including existing ones that have not been re-let recently.',
    'Provisional estimates are revised: PIPR revises the latest two months on each release.'
  ]
});

/** What the interface shows when the benchmark file has not been loaded. */
export const BENCHMARK_NOT_LOADED = Object.freeze({
  id: 'ons-london',
  label: 'Area benchmark · official statistics',
  available: false,
  publisher: 'Office for National Statistics',
  series: 'Price Index of Private Rents (PIPR)',
  licence: 'Open Government Licence v3.0',
  licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  sourceUrl: 'https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/august2026',
  attribution: null,
  referencePeriod: null,
  releasedAt: null,
  checkedAt: null,
  currency: 'GBP',
  locale: 'en-GB',
  figures: null,
  caveats: ['The ONS spreadsheet has not been downloaded in this deployment, so no benchmark figures are shown rather than figures of unknown provenance.']
});

export const BENCHMARKS = Object.freeze({
  'ons-london': ONS_LONDON
});

export function benchmarkById(id) {
  return BENCHMARKS[id] || null;
}
