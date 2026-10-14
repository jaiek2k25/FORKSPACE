/**
 * Search: filtering, sorting and the hard-limit check shared with the research
 * assistant.
 *
 * Budget filters are stored in INR and displayed in the visitor's chosen
 * currency using the illustrative FX table (see assets/js/data/fx.js). Rents
 * are converted to INR before any comparison so mixed currencies can never be
 * compared as raw numbers.
 */
import { toInr, fromInr, CURRENCIES, FX_RATES_AS_OF } from '../data/fx.js';
import { PROPERTY_TYPES, FURNISHING_STATUSES } from '../data/schema.js';

export const DEFAULT_FILTERS = Object.freeze({
  q: '',
  cities: [],
  types: [],
  bedroomsMin: null,
  rentMinInr: null,
  rentMaxInr: null,
  displayCurrency: 'INR',
  furnishing: [],
  leaseMonthsMin: null,
  statuses: [],
  amenities: []
});

export const SORTS = Object.freeze([
  { id: 'relevance', label: 'Relevance' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'beds-desc', label: 'Bedrooms: most first' },
  { id: 'city-asc', label: 'City (A–Z)' }
]);

export const AMENITY_SUGGESTIONS = Object.freeze([
  'Lift', 'Furnished', 'Balcony', 'Garden', 'Parking', 'Gym', 'Pool', 'Dishwasher', 'Washing machine', 'Air conditioning', 'Bicycle storage', 'Double glazing'
]);

/** Does a listing satisfy the amenity list (case-insensitive substring match)? */
export function hasAmenity(listing, amenity) {
  const needle = amenity.toLowerCase();
  return (listing.amenities || []).some((item) => item.toLowerCase().includes(needle));
}

export function rentInInr(listing) {
  const rent = listing?.rent;
  if (!rent || rent.kind === 'unknown' || rent.amount === null || rent.amount === undefined) return null;
  return toInr(Number(rent.amount), rent.currency);
}

/** Parse filters from a URLSearchParams instance so search state is shareable. */
export function parseFilters(params) {
  const list = (key) => {
    const raw = params.get(key);
    return raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : [];
  };
  const number = (key) => {
    const raw = params.get(key);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    ...DEFAULT_FILTERS,
    q: params.get('q') || '',
    cities: list('cities'),
    types: list('types'),
    bedroomsMin: number('beds'),
    rentMinInr: number('rentMin'),
    rentMaxInr: number('rentMax'),
    displayCurrency: CURRENCIES.includes(params.get('cur')) ? params.get('cur') : 'INR',
    furnishing: list('furnishing'),
    leaseMonthsMin: number('lease'),
    statuses: list('statuses'),
    amenities: list('amenities')
  };
}

export function filtersToParams(filters, sort = 'relevance') {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  for (const key of ['cities', 'types', 'furnishing', 'statuses', 'amenities']) {
    if (filters[key]?.length) params.set(key, filters[key].join(','));
  }
  if (filters.bedroomsMin) params.set('beds', String(filters.bedroomsMin));
  if (filters.rentMinInr) params.set('rentMin', String(filters.rentMinInr));
  if (filters.rentMaxInr) params.set('rentMax', String(filters.rentMaxInr));
  if (filters.leaseMonthsMin) params.set('lease', String(filters.leaseMonthsMin));
  if (filters.displayCurrency && filters.displayCurrency !== 'INR') params.set('cur', filters.displayCurrency);
  if (sort && sort !== 'relevance') params.set('sort', sort);
  return params;
}

const FURNISHING_ALIASES = {
  furnished: ['furnished'],
  'semi-furnished': ['semi-furnished', 'upholstered'],
  unfurnished: ['unfurnished']
};

/** Active filter chips, each with the key needed to remove it. */
export function activeChips(filters, currencyLabel = (inr) => String(inr)) {
  const chips = [];
  if (filters.q) chips.push({ key: 'q', value: filters.q, label: `“${filters.q}”` });
  for (const city of filters.cities) chips.push({ key: 'cities', value: city, label: city });
  for (const type of filters.types) chips.push({ key: 'types', value: type, label: type });
  for (const furnishing of filters.furnishing) chips.push({ key: 'furnishing', value: furnishing, label: furnishing });
  for (const status of filters.statuses) chips.push({ key: 'statuses', value: status, label: `status: ${status}` });
  for (const amenity of filters.amenities) chips.push({ key: 'amenities', value: amenity, label: amenity });
  if (filters.bedroomsMin) chips.push({ key: 'bedroomsMin', value: filters.bedroomsMin, label: `${filters.bedroomsMin}+ bedrooms` });
  if (filters.leaseMonthsMin) chips.push({ key: 'leaseMonthsMin', value: filters.leaseMonthsMin, label: `${filters.leaseMonthsMin}+ month lease` });
  if (filters.rentMinInr) chips.push({ key: 'rentMinInr', value: filters.rentMinInr, label: `from ${currencyLabel(filters.rentMinInr)}` });
  if (filters.rentMaxInr) chips.push({ key: 'rentMaxInr', value: filters.rentMaxInr, label: `up to ${currencyLabel(filters.rentMaxInr)}` });
  return chips;
}

function tokenise(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9+]+/)
    .filter(Boolean);
}

/** Relevance score for the free-text box. 0 means "does not match". */
export function relevanceScore(listing, query) {
  const tokens = tokenise(query);
  if (tokens.length === 0) return 1;
  const haystack = [
    listing.title,
    listing.city,
    listing.area,
    listing.country,
    listing.propertyType,
    listing.furnishing,
    ...(listing.tags || []),
    ...(listing.amenities || [])
  ].join(' ').toLowerCase();
  const normalisedHaystack = tokenise(haystack).join(' ');
  let score = 0;
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (normalisedHaystack.includes(token)) score += 2;
    else if ((listing.title || '').toLowerCase().includes(token)) score += 3;
  }
  return score;
}

/**
 * Apply every filter.
 * @returns {{results: Array<object>, excludedByBudget: Array<object>, matched: number}}
 */
export function filterListings(listings, filters, now = Date.now()) {
  void now;
  const excludedByBudget = [];
  const results = listings.filter((listing) => {
    if (filters.q && relevanceScore(listing, filters.q) === 0) return false;
    if (filters.cities.length && !filters.cities.includes(listing.cityId)) return false;
    if (filters.types.length && !filters.types.includes(listing.propertyType)) return false;
    if (filters.furnishing.length) {
      const listingFurnishing = String(listing.furnishing || 'unknown').toLowerCase();
      const accepted = filters.furnishing.some((option) =>
        (FURNISHING_ALIASES[option] || [option]).includes(listingFurnishing));
      if (!accepted) return false;
    }
    if (filters.statuses.length && !filters.statuses.includes(listing.status)) return false;
    if (filters.bedroomsMin !== null && (listing.bedrooms === null || listing.bedrooms < filters.bedroomsMin)) return false;
    if (filters.leaseMonthsMin !== null && (listing.leaseMonths === null || listing.leaseMonths < filters.leaseMonthsMin)) return false;
    if (filters.amenities.length && !filters.amenities.every((amenity) => hasAmenity(listing, amenity))) return false;

    const budgetSet = filters.rentMinInr !== null || filters.rentMaxInr !== null;
    if (budgetSet) {
      const inr = rentInInr(listing);
      if (inr === null) {
        // An unknown rent cannot be shown to fit a budget, so it is excluded
        // and the reason is reported rather than hidden.
        excludedByBudget.push({ listing, reason: 'Rent is not stated, so it cannot be matched against your budget.' });
        return false;
      }
      if (filters.rentMinInr !== null && inr < filters.rentMinInr) {
        excludedByBudget.push({ listing, reason: 'Below your minimum rent.' });
        return false;
      }
      if (filters.rentMaxInr !== null && inr > filters.rentMaxInr) {
        excludedByBudget.push({ listing, reason: 'Above your maximum rent.' });
        return false;
      }
    }
    return true;
  });
  return { results, excludedByBudget, matched: results.length };
}

/**
 * Homes that can still be rented come first, whatever the sort order.
 *
 * A sort key such as price or size says nothing about whether a home is still on
 * the market, so a withdrawn home would otherwise appear above a live one with no
 * signal beyond its badge. This is a *tiebreaker only*: it never overrides the
 * visitor's chosen sort, and no home is hidden — a let or withdrawn record stays
 * in the list, with its badge and its freshness.
 */
const STATUS_RANK = Object.freeze({ available: 0, sample: 1, unknown: 2, pending: 3, let: 4, withdrawn: 5 });

function byAvailability(a, b) {
  const aRank = STATUS_RANK[a.status] ?? 3;
  const bRank = STATUS_RANK[b.status] ?? 3;
  return aRank - bRank;
}

export function sortListings(listings, sortKey) {
  const copy = [...listings];
  const priceOf = (listing) => {
    const inr = rentInInr(listing);
    return inr === null ? Number.POSITIVE_INFINITY : inr;
  };
  switch (sortKey) {
    case 'price-asc':
      copy.sort((a, b) => priceOf(a) - priceOf(b) || byAvailability(a, b) || a.city.localeCompare(b.city) || a.id.localeCompare(b.id));
      break;
    case 'price-desc':
      copy.sort((a, b) => {
        const aPrice = priceOf(a);
        const bPrice = priceOf(b);
        if (aPrice === Number.POSITIVE_INFINITY && bPrice === Number.POSITIVE_INFINITY) return byAvailability(a, b) || a.city.localeCompare(b.city);
        if (aPrice === Number.POSITIVE_INFINITY) return 1; // unknown rents sort last, never first
        if (bPrice === Number.POSITIVE_INFINITY) return -1;
        return bPrice - aPrice || byAvailability(a, b) || a.city.localeCompare(b.city);
      });
      break;
    case 'beds-desc':
      copy.sort((a, b) => (b.bedrooms ?? -1) - (a.bedrooms ?? -1) || byAvailability(a, b) || a.city.localeCompare(b.city));
      break;
    case 'city-asc':
      copy.sort((a, b) => a.city.localeCompare(b.city) || byAvailability(a, b) || (a.bedrooms ?? 0) - (b.bedrooms ?? 0));
      break;
    default:
      copy.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0) || byAvailability(a, b) || a.id.localeCompare(b.id));
      break;
  }
  return copy;
}

/** Sort by relevance to a query, keeping live homes above ones that are gone. */
export function sortByRelevance(listings, query) {
  return listings
    .map((listing) => ({ ...listing, relevance: relevanceScore(listing, query) }))
    .sort((a, b) => b.relevance - a.relevance || byAvailability(a, b) || a.city.localeCompare(b.city) || a.id.localeCompare(b.id));
}

/** Display a stored INR budget in another currency, converted with the static table. */
export function displayBudget(amountInr, currency) {
  if (amountInr === null || amountInr === undefined) return null;
  const converted = fromInr(amountInr, currency);
  return converted === null ? null : Math.round(converted);
}

export function budgetNote(from, to) {
  if (from === to) return `Budget stored and shown in ${from}.`;
  return `Budget stored in INR and converted for display into ${to} using the illustrative static FX table (date ${FX_RATES_AS_OF}). Not a live rate.`;
}

export const PROPERTY_TYPE_OPTIONS = PROPERTY_TYPES;
export const FURNISHING_OPTIONS = FURNISHING_STATUSES.filter((status) => status !== 'unknown');

/**
 * Hard limits used by the research assistant: a listing that fails one is
 * excluded with a stated reason and is never scored.
 */
export function hardLimitFailures(listing, limits = {}) {
  const failures = [];
  if (limits.cities?.length) {
    const match = limits.cities.some((city) => listing.cityId === city || listing.city.toLowerCase() === String(city).toLowerCase());
    if (!match) failures.push({ field: 'city', reason: `Outside the requested city (${listing.city}).` });
  }
  if (limits.propertyType && listing.propertyType !== limits.propertyType) {
    failures.push({ field: 'propertyType', reason: `Property type is ${listing.propertyType}, not ${limits.propertyType}.` });
  }
  if (limits.bedrooms !== null && limits.bedrooms !== undefined) {
    if (listing.bedrooms === null || listing.bedrooms < limits.bedrooms) {
      failures.push({ field: 'bedrooms', reason: `Only ${listing.bedrooms ?? 'an unstated number of'} bedroom(s).` });
    }
  }
  if (limits.maxRentInr !== null && limits.maxRentInr !== undefined) {
    const inr = rentInInr(listing);
    if (inr === null) failures.push({ field: 'maxRent', reason: 'Rent is not stated, so it cannot be shown to be within your maximum.' });
    else if (inr > limits.maxRentInr) failures.push({ field: 'maxRent', reason: 'Rent is above your stated maximum.' });
  }
  if (listing.status === 'let' || listing.status === 'withdrawn') {
    failures.push({ field: 'status', reason: listing.status === 'let' ? 'Already let.' : 'Withdrawn from the market.' });
  }
  return failures;
}
