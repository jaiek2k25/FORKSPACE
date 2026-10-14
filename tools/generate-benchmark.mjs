#!/usr/bin/env node
/**
 * Regenerate assets/js/data/benchmarks.js from a downloaded ONS spreadsheet.
 *
 * Why this exists: the app must never serve or bundle a spreadsheet, and the
 * figures shown must be traceable to a release. The operator downloads the
 * "Price Index of Private Rents, UK: monthly price statistics" dataset from
 * ONS (Open Government Licence v3.0), saves the rent price-levels sheet as CSV
 * under tools/open-data/ (git-ignored), and runs this script.
 *
 * Usage:
 *   npm run benchmarks                      # uses the default CSV path
 *   node tools/generate-benchmark.mjs --csv path/to/rents.csv
 *
 * The script never fetches anything itself: no scraping, no map services.
 * Without a CSV it leaves the existing module untouched and explains what to do.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_CSV = path.join(ROOT, 'tools', 'open-data', 'ons-pipr-price-levels.csv');
const TARGET = path.join(ROOT, 'assets', 'js', 'data', 'benchmarks.js');

function parseArgs(argv) {
  const index = argv.indexOf('--csv');
  return { csv: index === -1 ? DEFAULT_CSV : path.resolve(argv[index + 1]) };
}

/** Find a numeric value for one area from a PIPR-style CSV. */
function findAverageRent(rows, matchers) {
  for (const row of rows) {
    const area = (row.Area || row.area || row.Region || row.region || '').toLowerCase();
    const name = (row['Area name'] || row.areacode || '').toLowerCase();
    const haystack = `${area} ${name} ${JSON.stringify(row).toLowerCase()}`;
    if (matchers.every((m) => haystack.includes(m))) {
      for (const key of ['Price', 'price', 'Average price', 'average price', 'Rent', 'rent', 'Value', 'value']) {
        const raw = row[key];
        if (raw !== undefined) {
          const value = Number(String(raw).replace(/[^0-9.]/g, ''));
          if (Number.isFinite(value) && value > 0) return Math.round(value);
        }
      }
    }
  }
  return null;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

function build({ london, uk, england, referencePeriod, releasedAt }) {
  const stamp = new Date().toISOString();
  return `/**
 * Generated open-data benchmark module.
 *
 * DO NOT EDIT BY HAND — regenerate with \`npm run benchmarks\`.
 *
 * Source:  Office for National Statistics, Price Index of Private Rents (PIPR).
 * Licence: Open Government Licence v3.0.
 * The spreadsheet it is generated from lives outside the web root and is never
 * served by the application.
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
  sourceUrl: 'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
  attribution: 'Source: Office for National Statistics – Price Index of Private Rents, licensed under the Open Government Licence v3.0',
  referencePeriod: ${JSON.stringify(referencePeriod)},
  releasedAt: ${JSON.stringify(releasedAt)},
  checkedAt: ${JSON.stringify(stamp)},
  generatedAt: ${JSON.stringify(stamp)},
  generatedBy: 'tools/generate-benchmark.mjs',
  currency: 'GBP',
  locale: 'en-GB',
  figures: {
    londonAverageMonthlyRent: ${london},
    ukAverageMonthlyRent: ${uk},
    englandAverageMonthlyRent: ${england}
  },
  caveats: [
    'This is an area average across the whole private rented stock, not the asking rent for this home.',
    'It is not split by number of bedrooms or property type, so it cannot be compared directly with a one-bedroom flat.',
    'It covers all tenancies, including existing ones that have not been re-let recently.',
    'Provisional estimates are revised: PIPR revises the latest two months on each release.'
  ]
});

export const BENCHMARKS = Object.freeze({ 'ons-london': ONS_LONDON });

export function benchmarkById(id) {
  return BENCHMARKS[id] || null;
}
`;
}

function main() {
  const { csv } = parseArgs(process.argv.slice(2));
  if (!existsSync(csv)) {
    mkdirSync(path.dirname(csv), { recursive: true });
    console.log('No ONS spreadsheet found, so nothing was regenerated.');
    console.log(`Expected at: ${path.relative(ROOT, csv)}  (git-ignored)`);
    console.log('');
    console.log('To refresh the London benchmark:');
    console.log('  1. Download "Price Index of Private Rents, UK: monthly price statistics" from ons.gov.uk');
    console.log('     (dataset page: https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics)');
    console.log('  2. Export the rent price-levels sheet as CSV to the path above.');
    console.log('  3. Run npm run benchmarks again.');
    console.log('');
    console.log('The dataset is licensed under the Open Government Licence v3.0. The spreadsheet');
    console.log('is deliberately excluded from the repository and from the Docker image.');
    return;
  }
  const rows = parseCsv(readFileSync(csv, 'utf8'));
  const london = findAverageRent(rows, ['london']);
  const uk = findAverageRent(rows, ['united kingdom']) || findAverageRent(rows, ['uk']);
  const england = findAverageRent(rows, ['england']);
  if (!london || !uk) {
    console.error('Could not find London and UK rows in that CSV. Expected columns like Area, Price and a reference period column.');
    process.exitCode = 1;
    return;
  }
  writeFileSync(
    TARGET,
    build({
      london,
      uk,
      england: england || uk,
      referencePeriod: new Date().toISOString().slice(0, 7),
      releasedAt: new Date().toISOString().slice(0, 10)
    })
  );
  console.log(`Wrote ${path.relative(ROOT, TARGET)} with London ${london}, UK ${uk}, England ${england || uk}.`);
}

main();
