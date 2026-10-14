/**
 * Research assistant.
 *
 * Two adapters exist:
 *   mock  — deterministic, offline, reads the demo dataset. Always available.
 *   model — server-side only (NVIDIA-hosted endpoint). The model returns a
 *           preference JSON object and nothing else.
 *
 * In both cases the matching, scoring, cost maths and explanations below are
 * computed in code. The model never decides which home is good, never writes a
 * total, and never sees anything except the brief.
 *
 * Criteria are met / not met / unknown. An unknown is never scored as met, and
 * a listing is judged only on fields that actually exist in the record.
 *
 * The assistant never claims to have searched the real world: it scores the
 * records loaded in this prototype and says so in the interface.
 */
import { DEFAULT_LOCALE_FOR, fromInr, RATES_PER_INR, isSupportedCurrency } from '../data/fx.js';
import { hardLimitFailures, rentInInr, hasAmenity } from './filters.js';
import { buildCostBreakdown } from './costs.js';
import { timeToRead } from './text.js';

export const BRIEF_LIMIT = 1000;
export const WALKABLE_ESTIMATE_THRESHOLD = 75;

/** Only these keys ever survive from model output. Everything else is dropped. */
export const PREFERENCE_FIELDS = Object.freeze([
  'city', 'cities', 'area', 'maxRentAmount', 'maxRentCurrency', 'bedroomsMin',
  'propertyType', 'furnished', 'leaseMonthsMin', 'commuteMaxMinutes', 'walkable',
  'mustHaveAmenities', 'niceToHaveAmenities', 'notes'
]);

const CITY_ALIASES = Object.freeze({
  coimbatore: ['coimbatore', 'kovai'],
  bengaluru: ['bengaluru', 'bangalore'],
  lisbon: ['lisbon', 'lisboa'],
  berlin: ['berlin'],
  london: ['london'],
  toronto: ['toronto'],
  tokyo: ['tokyo'],
  dubai: ['dubai'],
  melbourne: ['melbourne'],
  'new-york': ['new york', 'nyc', 'new york city', 'brooklyn', 'manhattan'],
  'mexico-city': ['mexico city', 'ciudad de mexico', 'cdmx', 'mexico'],
  amsterdam: ['amsterdam']
});

/**
 * Property-type patterns. These are regular expressions with word boundaries on
 * purpose: a naive substring search for "room" also matches "bedroom", which
 * would classify a one-bedroom flat as a single room.
 */
const TYPE_PATTERNS = Object.freeze({
  apartment: /\b(apartments?|flats?|condos?|condominiums?|units?)\b/,
  house: /\b(houses?|villas?|bungalows?)\b/,
  studio: /\b(studios?|bedsits?)\b/,
  townhouse: /\b(townhouses?|terraced?|row house|terrace house)\b/,
  loft: /\blofts?\b/,
  shared: /\b(shared|sharing|co-?living)\b/,
  room: /\b(room in a shared|single room|spare room|own room)\b/
});

const CURRENCY_HINTS = Object.freeze({
  '₹': 'INR', rs: 'INR', inr: 'INR', rupees: 'INR', rupee: 'INR',
  '€': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
  '£': 'GBP', gbp: 'GBP', pounds: 'GBP', pound: 'GBP',
  '$': 'USD', usd: 'USD', 'c$': 'CAD', cad: 'CAD', 'a$': 'AUD', aud: 'AUD',
  '¥': 'JPY', jpy: 'JPY', yen: 'JPY', aed: 'AED', dirham: 'AED', dirhams: 'AED',
  mxn: 'MXN', pesos: 'MXN', peso: 'MXN'
});

/**
 * Normalise untrusted preferences (from the model or from the brief).
 * Unknown fields are discarded, values are clamped, and nothing is invented.
 */
export function normalisePreferences(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  const dropped = [];
  for (const key of Object.keys(source)) {
    if (!PREFERENCE_FIELDS.includes(key)) dropped.push(key);
  }
  if (typeof source.city === 'string' && source.city.trim()) out.city = source.city.trim();
  if (Array.isArray(source.cities)) {
    const cities = source.cities.filter((city) => typeof city === 'string' && city.trim()).map((city) => city.trim());
    if (cities.length) out.cities = cities;
  }
  if (typeof source.area === 'string' && source.area.trim()) out.area = source.area.trim();
  const amount = Number(source.maxRentAmount);
  if (Number.isFinite(amount) && amount > 0) {
    out.maxRentAmount = Math.round(amount);
    out.maxRentCurrency = isSupportedCurrency(String(source.maxRentCurrency || '').toUpperCase())
      ? String(source.maxRentCurrency).toUpperCase()
      : null;
  }
  const bedrooms = Number(source.bedroomsMin);
  if (Number.isFinite(bedrooms) && bedrooms >= 0 && bedrooms <= 10) out.bedroomsMin = Math.round(bedrooms);
  if (typeof source.propertyType === 'string' && Object.prototype.hasOwnProperty.call(TYPE_PATTERNS, source.propertyType)) {
    out.propertyType = source.propertyType;
  }
  if (typeof source.furnished === 'boolean') out.furnished = source.furnished;
  const lease = Number(source.leaseMonthsMin);
  if (Number.isFinite(lease) && lease > 0 && lease <= 60) out.leaseMonthsMin = Math.round(lease);
  const commute = Number(source.commuteMaxMinutes);
  if (Number.isFinite(commute) && commute > 0 && commute <= 240) out.commuteMaxMinutes = Math.round(commute);
  if (typeof source.walkable === 'boolean') out.walkable = source.walkable;
  if (Array.isArray(source.mustHaveAmenities)) {
    out.mustHaveAmenities = source.mustHaveAmenities.filter((item) => typeof item === 'string' && item.trim()).slice(0, 12);
  }
  if (Array.isArray(source.niceToHaveAmenities)) {
    out.niceToHaveAmenities = source.niceToHaveAmenities.filter((item) => typeof item === 'string' && item.trim()).slice(0, 12);
  }
  if (typeof source.notes === 'string' && source.notes.trim()) out.notes = source.notes.trim().slice(0, 500);
  return { preferences: out, dropped };
}

function findCity(text, listings) {
  const haystack = ` ${text.toLowerCase()} `;
  const known = [...new Set(listings.map((listing) => listing.cityId))];
  const hits = [];
  for (const cityId of known) {
    const aliases = CITY_ALIASES[cityId] || [cityId.replace(/-/g, ' ')];
    for (const alias of aliases) {
      if (haystack.includes(` ${alias} `) || haystack.includes(`${alias},`) || haystack.includes(`${alias}.`)) {
        hits.push({ cityId, alias });
        break;
      }
    }
  }
  return hits;
}

function findCurrency(text) {
  const lowered = text.toLowerCase();
  // Prefixed symbols first so "C$2,400" is read as Canadian dollars.
  for (const [hint, code] of Object.entries(CURRENCY_HINTS)) {
    if (hint.length > 1 && lowered.includes(hint)) return code;
  }
  for (const [hint, code] of Object.entries(CURRENCY_HINTS)) {
    if (hint.length === 1 && text.includes(hint)) return code;
  }
  /**
   * A three-letter code the hint table does not know (ISK, CHF, SEK…). It is
   * reported rather than ignored, because a visitor who wrote it stated a
   * budget and the honest answer is that the prototype cannot convert it — it
   * must never be silently re-read as the city's currency.
   */
  const code = text.match(/\b([A-Z]{3})\b/);
  if (code) return code[1];
  return null;
}

/** Deterministic brief reader — this is the mock adapter's "understanding". */
export function extractPreferences(brief, { listings }) {
  const text = String(brief || '').slice(0, BRIEF_LIMIT);
  const lowered = text.toLowerCase();
  const raw = {};

  const cityHits = findCity(text, listings);
  if (cityHits.length) raw.city = cityHits[0].cityId;

  const amountMatch = text.match(/(?:under|below|max|maximum|up to|within|budget of|around|about)?\s*(?:[₹$€£¥]\s*)?([0-9][0-9,\.]{2,12})(?:\s*(?:per|a|each)?\s*(?:month|monthly|pcm))?/i);
  if (amountMatch) {
    const amount = Number(amountMatch[1].replace(/[,\s]/g, ''));
    if (Number.isFinite(amount) && amount >= 100) {
      raw.maxRentAmount = Math.round(amount);
      raw.maxRentCurrency = findCurrency(text);
    }
  }

  const bedroomWords = [
    [1, ['one bedroom', 'one-bedroom', '1 bedroom', '1-bedroom', '1 bed', '1br', 'single bedroom']],
    [2, ['two bedroom', 'two-bedroom', '2 bedroom', '2-bedroom', '2 bed', '2br']],
    [3, ['three bedroom', 'three-bedroom', '3 bedroom', '3-bedroom', '3 bed', '3br']]
  ];
  for (const [count, words] of bedroomWords) {
    if (words.some((word) => lowered.includes(word))) {
      raw.bedroomsMin = count;
      break;
    }
  }
  if (!raw.bedroomsMin && lowered.includes('studio')) raw.bedroomsMin = 0;

  // Order matters: a shared flat is described as shared, not as an apartment.
  for (const type of ['room', 'shared', 'studio', 'townhouse', 'loft', 'apartment', 'house']) {
    if (TYPE_PATTERNS[type].test(lowered)) {
      raw.propertyType = type;
      break;
    }
  }

  if (/\bunfurnished\b/.test(lowered)) raw.furnished = false;
  else if (/\b(furnished|with furniture|turnkey)\b/.test(lowered)) raw.furnished = true;

  const leaseMatch = lowered.match(/(\d{1,2})[\s-]*(?:month|months|mo)\s*(?:lease|contract|tenancy)/);
  if (leaseMatch) raw.leaseMonthsMin = Number(leaseMatch[1]);

  const commuteMatch = lowered.match(/(?:commute|travel|journey)[^0-9]{0,24}(\d{1,3})\s*(?:min|minutes)/)
    || lowered.match(/within\s*(\d{1,3})\s*(?:min|minutes)/);
  if (commuteMatch) raw.commuteMaxMinutes = Number(commuteMatch[1]);
  else if (/\bcommute\b/.test(lowered) || /\bcommut(e|ing)\b/.test(lowered)) raw._commuteMentioned = true;

  if (/\b(walkable|walk score|without a car|on foot)\b/.test(lowered)) raw.walkable = true;
  if (/\b(car|driving|drive)\b/.test(lowered) && !raw.walkable) raw.walkable = false;

  /**
   * Amenities mentioned in passing are recorded as nice-to-have. Only an
   * explicitly required amenity becomes a hard "must have", because treating a
   * passing mention as a requirement would invent a constraint the visitor
   * never expressed.
   */
  const amenityWords = ['lift', 'elevator', 'balcony', 'garden', 'parking', 'gym', 'pool', 'dishwasher', 'washing machine', 'air conditioning', 'bicycle storage', 'terrace', 'concierge'];
  const mustHave = [];
  const niceToHave = [];
  for (const word of amenityWords) {
    const index = lowered.indexOf(word);
    if (index === -1) continue;
    const window = lowered.slice(Math.max(0, index - 28), index);
    if (/\b(must|required|require|needs?|needed|has to have|has to be)\b/.test(window)) mustHave.push(word);
    else niceToHave.push(word);
  }
  if (mustHave.length) raw.mustHaveAmenities = mustHave;
  if (niceToHave.length) raw.niceToHaveAmenities = niceToHave;

  const { preferences, dropped } = normalisePreferences(raw);
  if (raw._commuteMentioned && preferences.commuteMaxMinutes === undefined) {
    preferences.commuteMaxMinutes = null; // mentioned without a number: an explicit "still missing" note
  }
  const commuteMentioned = Boolean(raw._commuteMentioned);
  /**
   * A currency this prototype cannot convert must never be dropped quietly: the
   * visitor stated a budget, and the honest answer is that it was not applied.
   */
  const statedCurrency = raw.maxRentCurrency ? String(raw.maxRentCurrency).toUpperCase() : null;
  const unsupportedCurrency = statedCurrency && !isSupportedCurrency(statedCurrency) ? statedCurrency : null;
  const statedAmount = Number.isFinite(Number(raw.maxRentAmount)) ? Number(raw.maxRentAmount) : null;
  if (unsupportedCurrency) {
    /**
     * The amount is deliberately removed as well as the currency. Keeping the
     * number would let the city's currency be assumed for it, which would turn
     * an unconvertible budget into a limit the visitor never gave.
     */
    delete preferences.maxRentAmount;
    delete preferences.maxRentCurrency;
  }
  return {
    preferences,
    dropped,
    understood: {
      cityHits,
      currencyStated: statedCurrency,
      unsupportedCurrency,
      unsupportedCurrencyAmount: unsupportedCurrency ? statedAmount : null,
      commuteMentioned,
      textLength: text.length,
      readingTime: timeToRead(text)
    }
  };
}

/** Currency used for a brief's budget when none was stated. */
function budgetCurrency(preferences, listings) {
  if (preferences.maxRentCurrency) return preferences.maxRentCurrency;
  const city = preferences.city;
  if (city) {
    const match = listings.find((listing) => listing.cityId === city);
    if (match) return match.rent.currency;
  }
  return 'INR';
}

export function briefToLimits(preferences, listings) {
  return {
    cities: preferences.city ? [preferences.city] : [],
    propertyType: preferences.propertyType || null,
    bedrooms: preferences.bedroomsMin === undefined ? null : preferences.bedroomsMin,
    maxRentInr: Number.isFinite(preferences.maxRentAmount)
      ? preferences.maxRentAmount / RATES_PER_INR[budgetCurrency(preferences, listings)]
      : null,
    maxRentAmount: Number.isFinite(preferences.maxRentAmount) ? preferences.maxRentAmount : null,
    maxRentCurrency: Number.isFinite(preferences.maxRentAmount) ? budgetCurrency(preferences, listings) : null,
    commuteMaxMinutes: preferences.commuteMaxMinutes ?? null
  };
}

function criterion(label, state, evidence) {
  return { label, state, evidence };
}

function listingCriteria(listing, preferences, limits) {
  const criteria = [];

  if (limits.maxRentAmount) {
    const inr = rentInInr(listing);
    const currency = limits.maxRentCurrency;
    const limitText = `${currency} ${limits.maxRentAmount.toLocaleString('en-GB')}`;
    if (inr === null) {
      criteria.push(criterion('Within your maximum rent', 'unknown', `The listing states no rent, so it cannot be compared with your ${limitText} limit.`));
    } else if (inr <= limits.maxRentInr) {
      const inCurrency = Math.round(fromInr(inr, currency));
      criteria.push(criterion('Within your maximum rent', 'met', `${currency} ${inCurrency.toLocaleString('en-GB')} stated, at or below your ${limitText} limit.`));
    } else {
      const over = Math.round(fromInr(inr - limits.maxRentInr, currency));
      criteria.push(criterion('Within your maximum rent', 'not_met', `About ${currency} ${over.toLocaleString('en-GB')} above your limit, converted with the illustrative FX table.`));
    }
  }

  if (preferences.furnished !== undefined) {
    if (listing.furnishing === 'unknown' || !listing.furnishing) {
      criteria.push(criterion('Furnished', 'unknown', 'The record does not state whether the home is furnished.'));
    } else if (preferences.furnished && listing.furnishing === 'furnished') {
      criteria.push(criterion('Furnished', 'met', 'Recorded as furnished.'));
    } else if (preferences.furnished && listing.furnishing === 'semi-furnished') {
      criteria.push(criterion('Furnished', 'not_met', 'Recorded as semi-furnished (fixtures and fittings only).'));
    } else if (!preferences.furnished && listing.furnishing === 'unfurnished') {
      criteria.push(criterion('Unfurnished', 'met', 'Recorded as unfurnished.'));
    } else {
      criteria.push(criterion(preferences.furnished ? 'Furnished' : 'Unfurnished', 'not_met', `Recorded as ${listing.furnishing}.`));
    }
  }

  if (preferences.walkable === true) {
    const score = listing.walkScore?.score;
    if (!Number.isFinite(score)) {
      criteria.push(criterion('Walkable area', 'unknown', 'No walkability estimate is recorded for this home.'));
    } else if (score >= WALKABLE_ESTIMATE_THRESHOLD) {
      criteria.push(criterion('Walkable area', 'met', `Walkability estimate ${score}/100 (estimate, not a Walk Score® product).`));
    } else {
      criteria.push(criterion('Walkable area', 'not_met', `Walkability estimate ${score}/100 is below the ${WALKABLE_ESTIMATE_THRESHOLD} threshold used here.`));
    }
  }

  if (limits.commuteMaxMinutes) {
    const minutes = listing.commute?.minutes;
    if (!Number.isFinite(minutes) || listing.commute?.kind === 'unknown') {
      criteria.push(criterion('Commute within your limit', 'unknown', 'No commute time is recorded for this home, so it cannot be checked against your limit.'));
    } else if (minutes <= limits.commuteMaxMinutes) {
      criteria.push(criterion('Commute within your limit', 'met', `${minutes} minutes to ${listing.commute.hub} (estimate).`));
    } else {
      criteria.push(criterion('Commute within your limit', 'not_met', `${minutes} minutes to ${listing.commute.hub} (estimate) exceeds your ${limits.commuteMaxMinutes}-minute limit.`));
    }
  } else if (preferences.commuteMaxMinutes === null) {
    criteria.push(criterion('Commute within your limit', 'unknown', 'You mentioned a commute but gave no limit, so no home can be checked against it.'));
  }

  if (preferences.leaseMonthsMin) {
    if (!Number.isFinite(listing.leaseMonths)) {
      criteria.push(criterion(`Lease of ${preferences.leaseMonthsMin}+ months`, 'unknown', 'The record does not state a lease length.'));
    } else if (listing.leaseMonths >= preferences.leaseMonthsMin) {
      criteria.push(criterion(`Lease of ${preferences.leaseMonthsMin}+ months`, 'met', `Lease recorded as ${listing.leaseMonths} months.`));
    } else {
      criteria.push(criterion(`Lease of ${preferences.leaseMonthsMin}+ months`, 'not_met', `Lease recorded as ${listing.leaseMonths} months.`));
    }
  }

  for (const amenity of preferences.mustHaveAmenities || []) {
    if (hasAmenity(listing, amenity)) {
      criteria.push(criterion(`Has ${amenity}`, 'met', `“${amenity}” is named in the record.`));
    } else {
      criteria.push(criterion(`Has ${amenity}`, 'unknown', `“${amenity}” is not named in the record — that is not evidence that it is absent.`));
    }
  }

  for (const amenity of preferences.niceToHaveAmenities || []) {
    if (hasAmenity(listing, amenity)) {
      criteria.push(criterion(`Nice to have: ${amenity}`, 'met', `“${amenity}” is named in the record.`));
    }
  }

  return criteria;
}

function scoreOf(criteria) {
  const weights = { met: 1, not_met: 0, unknown: 0 };
  const total = criteria.length || 1;
  const score = criteria.reduce((sum, item) => sum + weights[item.state], 0);
  return { met: criteria.filter((c) => c.state === 'met').length, notMet: criteria.filter((c) => c.state === 'not_met').length, unknown: criteria.filter((c) => c.state === 'unknown').length, ratio: score / total };
}

function requirementsTable(preferences, limits, listings, meta) {
  const rows = [];
  const currency = limits.maxRentCurrency;
  if (meta?.unsupportedCurrency && meta?.unsupportedCurrencyAmount) {
    rows.push({
      label: 'Maximum rent',
      value: `${meta.unsupportedCurrency} ${Number(meta.unsupportedCurrencyAmount).toLocaleString('en-GB')} per month`,
      note: 'Not applied: this prototype converts only the nine currencies it ships with, and this is not one of them. Nothing was guessed on your behalf.',
      source: 'brief',
      hardLimit: false,
      applied: false
    });
  }
  if (limits.maxRentAmount) {
    const assumedNote = meta?.currencyStated
      ? 'Stated in your brief.'
      : `No currency was stated, so it was read as ${currency} because that is the currency of the city you named.`;
    rows.push({ label: 'Maximum rent', value: `${currency} ${limits.maxRentAmount.toLocaleString('en-GB')} per month`, note: assumedNote, source: 'brief', hardLimit: true });
  }
  if (preferences.city) {
    const city = listings.find((listing) => listing.cityId === preferences.city);
    rows.push({ label: 'City', value: city ? city.city : preferences.city, note: 'Read from your brief as a hard limit.', source: 'brief', hardLimit: true });
  }
  if (preferences.bedroomsMin !== undefined) {
    const value = preferences.bedroomsMin === 0 ? 'Studio' : `${preferences.bedroomsMin}+ bedrooms`;
    rows.push({ label: 'Bedrooms', value, note: 'Read from your brief as a hard limit.', source: 'brief', hardLimit: true });
  }
  if (preferences.propertyType) {
    rows.push({ label: 'Property type', value: preferences.propertyType, note: 'Read from your brief as a hard limit.', source: 'brief', hardLimit: true });
  }
  if (preferences.furnished !== undefined) {
    rows.push({ label: 'Furnishing', value: preferences.furnished ? 'Furnished' : 'Unfurnished', note: 'Scored as a preference, not a hard limit.', source: 'brief', hardLimit: false });
  }
  if (preferences.walkable === true) {
    rows.push({ label: 'Walkable area', value: `Estimate of ${WALKABLE_ESTIMATE_THRESHOLD}/100 or better`, note: 'Scored against the prototype walkability estimate.', source: 'brief', hardLimit: false });
  }
  if (limits.commuteMaxMinutes) {
    rows.push({ label: 'Commute', value: `Up to ${limits.commuteMaxMinutes} minutes`, note: 'Scored against the recorded commute estimate.', source: 'brief', hardLimit: false });
  } else if (preferences.commuteMaxMinutes === null) {
    rows.push({ label: 'Commute', value: 'Mentioned without a limit', note: 'No number was given, so no home can be checked against it.', source: 'brief', hardLimit: false });
  }
  if (preferences.leaseMonthsMin) {
    rows.push({ label: 'Lease', value: `${preferences.leaseMonthsMin}+ months`, note: 'Scored against the lease length in the record.', source: 'brief', hardLimit: false });
  }
  for (const amenity of preferences.mustHaveAmenities || []) {
    rows.push({ label: 'Must have', value: amenity, note: 'Only accepted when the record names it.', source: 'brief', hardLimit: false });
  }
  return rows;
}

/**
 * Build the full research report.
 * @param {object} input
 * @param {string} input.brief the visitor's own words
 * @param {object} input.preferences normalised preferences
 * @param {Array} input.listings candidate records
 * @param {'mock'|'model'} input.adapter which adapter produced the preferences
 * @param {string|null} input.model model name when the model adapter ran
 */
export function researchReport({ brief, preferences, listings, adapter, model = null, meta = {}, now = Date.now() }) {
  const limits = briefToLimits(preferences, listings);
  const evaluated = [];
  const excluded = [];

  for (const listing of listings) {
    const failures = hardLimitFailures(listing, limits);
    if (failures.length) {
      excluded.push({ listing, reasons: failures.map((failure) => failure.reason) });
      continue;
    }
    const criteria = listingCriteria(listing, preferences, limits);
    const score = scoreOf(criteria);
    const stillMissing = [
      preferences.commuteMaxMinutes === null ? 'You mentioned a commute but gave no limit, so commute times could not be scored.' : null,
      limits.maxRentAmount ? null : 'You did not give a maximum rent, so nothing here is judged on price.',
      limits.commuteMaxMinutes ? null : 'You did not give a commute limit, so travel time is reported as context only.',
      listing.rent.kind === 'unknown' ? 'The rent is not stated for this home.' : null,
      ...(listing.missing || []).slice(0, 3)
    ].filter(Boolean);

    evaluated.push({ listing, criteria, score, stillMissing });
  }

  evaluated.sort((a, b) => b.score.ratio - a.score.ratio || b.score.met - a.score.met || a.listing.city.localeCompare(b.listing.city));

  const matches = evaluated.map((entry) => ({
    ...entry,
    reasons: entry.criteria.filter((item) => item.state === 'met').map((item) => item.evidence),
    unknowns: entry.criteria.filter((item) => item.state === 'unknown'),
    failures: entry.criteria.filter((item) => item.state === 'not_met')
  }));

  const metCount = matches.filter((entry) => entry.failures.length === 0).length;
  const tradeoffs = matches
    .filter((entry) => entry.failures.length || entry.unknowns.length)
    .slice(0, 6)
    .map((entry) => ({
      id: entry.listing.id,
      title: entry.listing.title,
      city: entry.listing.city,
      lines: [
        ...entry.failures.map((item) => `${item.label}: ${item.evidence}`),
        ...entry.unknowns.map((item) => `${item.label}: not verifiable from the record — ${item.evidence}`),
        ...(entry.listing.tradeoffs || []).slice(0, 2)
      ]
    }));

  const missingInformation = [
    ...new Set(matches.flatMap((entry) => [
      ...entry.unknowns.map((item) => `${item.label} — ${entry.listing.city}: ${item.evidence}`),
      ...(entry.listing.missing || []).map((item) => `${entry.listing.city}: ${item}`)
    ]))
  ].slice(0, 12);

  const unsupportedCurrency = meta?.unsupportedCurrency || null;
  const stillMissing = [
    unsupportedCurrency
      ? `A rent figure was given in ${unsupportedCurrency}, and ${unsupportedCurrency} is not one of the currencies this prototype converts. No rent limit was applied, so these results are not filtered by price.`
      : (limits.maxRentAmount ? null : 'No rent limit in your brief, so the results are not filtered by price.'),
    limits.commuteMaxMinutes ? null : 'No commute limit in your brief, so commute times were not scored.',
    limits.cities.length ? null : 'No city in your brief, so homes from every city were considered.',
    preferences.furnished === undefined ? 'Furnishing was not specified.' : null
  ].filter(Boolean);

  const questionList = [
    'Ask what is included in the rent and what is billed separately, in writing.',
    'Ask for the total move-in amount before you pay anything.',
    'Ask which fees are refundable and which are not.',
    'Ask for the energy rating or running-cost estimate in writing.',
    'Ask how the deposit is protected and by which scheme.',
    'Ask what the notice period is and how the lease renews.',
    'Ask who is responsible for repairs and how to report them.',
    'Ask for a copy of the lease before paying a holding deposit.'
  ];

  const wantedCurrency = limits.maxRentCurrency || matches[0]?.listing?.rent?.currency || 'INR';
  const comparisonSummary = buildComparisonSummary(matches, wantedCurrency);

  return {
    adapter,
    model,
    generatedAt: new Date(now).toISOString(),
    brief,
    briefLength: String(brief || '').length,
    limits,
    preferences,
    understood: meta,
    requirements: requirementsTable(preferences, limits, listings, meta),
    counts: {
      considered: listings.length,
      excluded: excluded.length,
      matched: matches.length,
      fullyMet: metCount,
      unknownOnly: matches.filter((entry) => entry.failures.length === 0 && entry.unknowns.length > 0).length
    },
    matches,
    excluded,
    tradeoffs,
    missingInformation,
    stillMissing,
    questionsToInvestigate: questionList,
    comparisonSummary,
    disclosure: 'This assistant reads only the records loaded in this prototype and matches them against your brief in code. It does not search the internet, does not contact landlords, and makes no claim about the real world.'
  };
}

function buildComparisonSummary(matches, currency) {
  if (matches.length === 0) {
    return { rows: [], note: 'Nothing passed the hard limits, so there is nothing to compare. Loosen a limit and try again.' };
  }
  const rows = matches.slice(0, 4).map((entry) => {
    const breakdown = buildCostBreakdown(entry.listing);
    return {
      id: entry.listing.id,
      title: entry.listing.title,
      city: entry.listing.city,
      rent: entry.listing.rent.kind === 'unknown'
        ? { text: 'Rent not stated', kind: 'unknown', currency }
        : { text: `${entry.listing.rent.currency} ${Number(entry.listing.rent.amount).toLocaleString('en-GB')}`, kind: entry.listing.rent.kind, currency: entry.listing.rent.currency },
      monthlyKnown: breakdown.monthly.knownTotal,
      monthlyEstimates: breakdown.monthly.estimateTotal,
      upfrontKnown: breakdown.upfront.knownTotal,
      upfrontEstimates: breakdown.upfront.estimateTotal,
      currency: breakdown.currency,
      bedrooms: entry.listing.bedrooms,
      met: entry.score.met,
      unknown: entry.score.unknown,
      notMet: entry.score.notMet
    };
  });
  return {
    rows,
    note: 'Amounts are shown in each home\'s own currency and are never converted into one another here. Known and estimated parts are kept separate.',
    localeFor: DEFAULT_LOCALE_FOR
  };
}

export const CURRENT_MODEL_PLACEHOLDER = 'poolside/laguna-xs-2.1';
