/**
 * FORKSPACE demo dataset.
 *
 * ⚠️ EVERY record in this file is FICTIONAL and hand-written for the prototype.
 * The homes do not exist. Addresses are invented. Rents and fees are plausible
 * but invented. No record carries an original-source URL, and none carries a
 * verification timestamp — so nothing here can ever be presented as verified.
 *
 * The records exist to exercise the data model in `docs/LISTING_SCHEMA.md`:
 * known / estimate / unknown money, missing amenities, missing lease terms,
 * unavailable statuses, and "not stated" values.
 *
 * Photos are real, openly licensed photographs of the *city*, used as
 * illustration only. See assets/js/data/photos.js for attribution. Every
 * gallery is captioned "Illustrative photos · not of this specific home".
 */
import { SCHEMA_VERSION } from './schema.js';

const DEMO_SOURCE = Object.freeze({
  id: 'forkspace-demo',
  name: 'FORKSPACE sample dataset',
  kind: 'demo',
  url: null,
  attribution: 'Written by the FORKSPACE prototype authors. Fictional records.',
  licence: 'Demo content — no rights claimed, no third-party data',
  termsUrl: null
});

const DEMO_LICENCE_NOTE =
  'Sample record. Not a real listing, not a real address, not verified by anyone.';

/** Fee helper: `known`/`estimate` carry an amount, `unknown` never does. */
function fee(label, amount, currency, kind, frequency, note) {
  return {
    label,
    amount: kind === 'unknown' ? null : amount,
    currency: kind === 'unknown' ? currency : currency,
    kind,
    frequency,
    note
  };
}

function demoProvenance(index) {
  return {
    isDemo: true,
    fetchedAt: null,
    providerRecordId: `FS-DEMO-${String(index).padStart(4, '0')}`,
    rawHash: `demo:${String(index).padStart(4, '0')}`,
    schemaVersion: SCHEMA_VERSION
  };
}

function demoBase(index, overrides) {
  return {
    source: { ...DEMO_SOURCE },
    verification: { lastVerifiedAt: null, method: 'none' },
    status: 'sample',
    provenance: demoProvenance(index),
    ...overrides
  };
}

export const LISTINGS = [
  demoBase(1, {
    id: 'coim-01',
    title: 'Two-bedroom apartment near Race Course',
    city: 'Coimbatore',
    cityId: 'coimbatore',
    country: 'India',
    countryCode: 'IN',
    area: 'R.S. Puram',
    address: 'Fictional address — 4th floor, Karpagam Residency, Bharathiar Road, R.S. Puram, Coimbatore 641002',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    sizeSqm: 102,
    floor: '4 of 5',
    furnishing: 'semi-furnished',
    leaseMonths: 11,
    availableFrom: null,
    rent: {
      amount: 28000,
      currency: 'INR',
      locale: 'en-IN',
      kind: 'known',
      note: 'Rent stated in the sample record. Maintenance is separate.'
    },
    deposit: { months: 2, note: 'Two months rent, refundable subject to the (fictional) lease.' },
    fees: [
      fee('Security deposit', 56000, 'INR', 'known', 'one-off', 'Two months rent, refundable.'),
      fee('Brokerage', null, 'INR', 'unknown', 'one-off', 'Owner has not said whether a broker is involved.'),
      fee('Maintenance charge', 3000, 'INR', 'known', 'monthly', 'Stated by the owner as ₹3,000 per month.'),
      fee('Water charge', 400, 'INR', 'estimate', 'monthly', 'Shared borewell and tanker cost; estimated from comparable buildings.'),
      fee('Electricity', null, 'INR', 'unknown', 'monthly', 'Metered separately; no average given in the record.')
    ],
    amenities: ['Lift', 'Covered two-wheeler parking', 'Borewell water', 'Power backup for common areas'],
    amenitiesNote: 'Only amenities named in the record are listed. Nothing has been assumed.',
    commute: {
      label: 'Commute estimate',
      hub: 'Coimbatore Junction railway station',
      minutes: 18,
      kind: 'estimate',
      method: 'Straight-line distance estimate at an assumed 22 km/h; not a measured journey.',
      note: 'Estimated in code from the area centroid. Not a live routing result.'
    },
    walkScore: {
      score: 74,
      kind: 'estimate',
      note: 'Prototype estimate from the number of listed amenities within 1 km. Not a Walk Score® product.'
    },
    neighbourhood: {
      summary: 'Leafy, established residential area with schools, clinics and a market street within walking distance.',
      tags: ['walkable', 'green', 'family', 'quiet'],
      note: 'Written for the prototype. No third-party neighbourhood data is used.'
    },
    pros: ['Walking distance to a vegetable market and two clinics', 'Lift, so upper floor is practical', 'Maintenance is stated up front rather than shared later'],
    tradeoffs: ['Semi-furnished — wardrobes only, no white goods', 'Two-wheeler parking is covered; four-wheeler parking is not stated'],
    missing: ['Brokerage position', 'Average electricity bill', 'Whether pets are allowed', 'Water supply hours'],
    photos: ['coimbatore-street', 'interior-living-1', 'interior-bedroom-1', 'interior-kitchen-1'],
    benchmark: null,
    tags: ['inr', 'apartment', 'semi-furnished', 'walkable', 'family', 'lift']
  }),

  demoBase(2, {
    id: 'coim-02',
    title: 'Three-bedroom house with a small garden',
    city: 'Coimbatore',
    cityId: 'coimbatore',
    country: 'India',
    countryCode: 'IN',
    area: 'Saravanampatti',
    address: 'Fictional address — 12, Sathy Road service lane, Saravanampatti, Coimbatore 641035',
    lat: null,
    lng: null,
    propertyType: 'house',
    bedrooms: 3,
    bathrooms: 3,
    sizeSqm: 158,
    floor: 'Ground of 2',
    furnishing: 'unfurnished',
    leaseMonths: 24,
    availableFrom: null,
    status: 'let',
    rent: {
      amount: 42000,
      currency: 'INR',
      locale: 'en-IN',
      kind: 'known',
      note: 'Rent stated in the sample record. The home has since been let, so the figure is historical.'
    },
    deposit: { months: 3, note: 'Three months rent for an unfurnished house.' },
    fees: [
      fee('Security deposit', 126000, 'INR', 'known', 'one-off', 'Three months rent, refundable.'),
      fee('Brokerage', 21000, 'INR', 'estimate', 'one-off', 'Half a month rent; typical for the area, not stated for this home.'),
      fee('Water tanker', null, 'INR', 'unknown', 'monthly', 'Borewell only; tanker use depends on the monsoon.'),
      fee('Garden upkeep', 1200, 'INR', 'estimate', 'monthly', 'Gardener quoted by the owner verbally; not a written figure.')
    ],
    amenities: ['Two-wheeler parking', 'Borewell water', 'Private garden'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'KCT tech park, Saravanampatti', minutes: 9, kind: 'estimate', method: 'Straight-line estimate at an assumed 22 km/h.', note: 'Estimated in code.' },
    walkScore: { score: 46, kind: 'estimate', note: 'Prototype estimate. This area is car-oriented.' },
    neighbourhood: { summary: 'Fast-growing northern suburb, mixed industrial and residential, dependent on two-wheelers or cars.', tags: ['suburban', 'quiet', 'family'], note: 'Written for the prototype.' },
    pros: ['Three bathrooms for a family', 'Private garden', 'Long 24-month lease offered'],
    tradeoffs: ['Unfurnished, so a full fit-out is needed', 'Low walkability', 'Already let — not available'],
    missing: ['Tanker water cost in summer', 'Whether the garden is included in maintenance', 'Pet policy'],
    photos: ['coimbatore-street', 'interior-kitchen-1', 'interior-living-1', 'interior-bedroom-1'],
    benchmark: null,
    tags: ['inr', 'house', 'unfurnished', 'garden', 'suburban', 'family']
  }),

  demoBase(3, {
    id: 'blr-01',
    title: 'Two-bedroom in a walkable Indiranagar block',
    city: 'Bengaluru',
    cityId: 'bengaluru',
    country: 'India',
    countryCode: 'IN',
    area: 'Indiranagar',
    address: 'Fictional address — 201, Sannidhi Apartments, 12th Main, Indiranagar, Bengaluru 560038',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    sizeSqm: 118,
    floor: '2 of 4',
    furnishing: 'furnished',
    leaseMonths: 11,
    availableFrom: null,
    rent: { amount: 65000, currency: 'INR', locale: 'en-IN', kind: 'known', note: 'Rent stated in the sample record, excluding maintenance.' },
    deposit: { months: 5, note: 'Owner asks five months; negotiable in most cases but recorded as stated.' },
    fees: [
      fee('Security deposit', 325000, 'INR', 'known', 'one-off', 'Five months rent as stated by the owner.'),
      fee('Maintenance charge', 4500, 'INR', 'known', 'monthly', 'Includes lift and common area power.'),
      fee('Brokerage', null, 'INR', 'unknown', 'one-off', 'Listing does not say whether a broker is involved.'),
      fee('Generator charge', 900, 'INR', 'estimate', 'monthly', 'Backup power is metered; estimate from comparable usage.'),
      fee('Society move-in fee', 2500, 'INR', 'known', 'one-off', 'One-off refundable society deposit for move-in.'),
      fee('Piped gas', 700, 'INR', 'estimate', 'monthly', 'Estimated from a two-person household.')
    ],
    amenities: ['Lift', 'Covered car parking', 'Modular kitchen', 'Washing machine', 'Air conditioning in both bedrooms', 'Gym in the building'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'MG Road metro station', minutes: 22, kind: 'estimate', method: 'Straight-line estimate at an assumed 18 km/h for city traffic.', note: 'Estimated in code. Traffic is not modelled.' },
    walkScore: { score: 91, kind: 'estimate', note: 'Prototype estimate from listed amenities and density of the area name. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Dense, mixed-use inner suburb: cafés, gyms and a metro line within 1.5 km.', tags: ['walkable', 'central', 'transit', 'nightlife'], note: 'Written for the prototype.' },
    pros: ['Furnished — move-in with a suitcase', 'Air conditioning already installed', 'High walkability and metro access'],
    tradeoffs: ['Five-month deposit is a heavy upfront cost', 'Noise from 100 Feet Road at weekends is not mentioned in the record'],
    missing: ['Brokerage position', 'Actual traffic time to MG Road', 'Water source and supply hours', 'Whether the deposit is indexed to future rent rises'],
    photos: ['bengaluru-towers', 'interior-living-1', 'interior-kitchen-1', 'interior-bedroom-1'],
    benchmark: null,
    tags: ['inr', 'apartment', 'furnished', 'walkable', 'transit', 'central', 'gym']
  }),

  demoBase(4, {
    id: 'lis-01',
    title: 'Two-bedroom with azulejo façade near Areeiro',
    city: 'Lisbon',
    cityId: 'lisbon',
    country: 'Portugal',
    countryCode: 'PT',
    area: 'Areeiro',
    address: 'Fictional address — 3.º Esq., Rua Inventada 42, Areeiro, 1000-000 Lisboa',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    sizeSqm: 78,
    floor: '3 of 6 with lift',
    furnishing: 'furnished',
    leaseMonths: 12,
    availableFrom: null,
    rent: { amount: 1450, currency: 'EUR', locale: 'pt-PT', kind: 'known', note: 'Rent stated in the sample record, condomínio included.' },
    deposit: { months: 2, note: 'Caução of two months, standard for a furnished let.' },
    fees: [
      fee('Caução (deposit)', 2900, 'EUR', 'known', 'one-off', 'Two months rent, refundable.'),
      fee('Condomínio', 0, 'EUR', 'known', 'monthly', 'Stated as included in the rent. Recorded as €0 so nothing is double counted.'),
      fee('IMI / property tax', null, 'EUR', 'unknown', 'annual', 'Paid by the owner in this record; not itemised for the tenant.'),
      fee('Utilities (electricity + water)', 95, 'EUR', 'estimate', 'monthly', 'Estimated for a two-person household; not metered figures.'),
      fee('Internet', 35, 'EUR', 'estimate', 'monthly', 'Estimated from a standard fibre package; not quoted in the record.')
    ],
    amenities: ['Lift', 'Furnished', 'Washing machine', 'Double glazing', 'Balcony'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'Areeiro metro station', minutes: 7, kind: 'estimate', method: 'Walking-distance estimate from the area centroid at 4.8 km/h.', note: 'Estimated in code; not a routing result.' },
    walkScore: { score: 88, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Central, well-connected and residential: metro, market and a garden square within walking distance.', tags: ['walkable', 'transit', 'central', 'local'], note: 'Written for the prototype.' },
    pros: ['Metro within a short walk', 'Furnished and double glazed', 'Condomínio included in the quoted rent'],
    tradeoffs: ['One bathroom for two bedrooms', 'Street parking only, and none is included'],
    missing: ['Energy rating (certificado energético)', 'Whether the furniture list is fixed', 'Rules on short-term guests'],
    photos: ['lisbon-facade', 'lisbon-avenida', 'interior-living-1', 'interior-bedroom-1'],
    benchmark: null,
    tags: ['eur', 'apartment', 'furnished', 'walkable', 'transit', 'central', 'balcony']
  }),

  demoBase(5, {
    id: 'ber-01',
    title: 'Quiet two-room Altbau off the courtyard',
    city: 'Berlin',
    cityId: 'berlin',
    country: 'Germany',
    countryCode: 'DE',
    area: 'Neukölln',
    address: 'Fictional address — 2. OG links, Hofgebäude, Beispielstraße 17, 12045 Berlin',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    sizeSqm: 64,
    floor: '2 of 5 (rear building)',
    furnishing: 'unfurnished',
    leaseMonths: 0,
    availableFrom: null,
    leaseMonthsNote: 'Open-ended lease; the record does not state a minimum term, so 0 months is recorded rather than assumed.',
    rent: {
      amount: 1320,
      currency: 'EUR',
      locale: 'de-DE',
      kind: 'estimate',
      note: 'Rent is an estimate derived from the local Mietspiegel band for comparable Altbau flats. It is not a quoted figure from the owner.'
    },
    deposit: { months: 3, note: 'Kaution of three months is the common maximum; recorded as stated.' },
    fees: [
      fee('Kaution (deposit)', 3960, 'EUR', 'estimate', 'one-off', 'Three months of the estimated rent.'),
      fee('Nebenkosten (service charges)', 210, 'EUR', 'estimate', 'monthly', 'Estimated band for heating, water and building costs.'),
      fee('Schufa report', 30, 'EUR', 'known', 'one-off', 'Standard credit report cost, stated by the agent.'),
      fee('Möblierungszuschlag (furnishing)', null, 'EUR', 'unknown', 'monthly', 'None stated; the flat is recorded as unfurnished.'),
      fee('Broadcast fee (Rundfunkbeitrag)', 18.36, 'EUR', 'known', 'monthly', 'Statutory household fee; the same for every household.')
    ],
    amenities: ['Courtyard', 'Bicycle storage', 'Central heating', 'Bathtub', 'Wooden floors'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'Hermannplatz U-Bahn', minutes: 11, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h from the area centroid.', note: 'Estimated in code.' },
    walkScore: { score: 90, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Inner-city Berlin mix: cafés, canals, late-opening shops and two U-Bahn lines.', tags: ['walkable', 'transit', 'central', 'nightlife'], note: 'Written for the prototype.' },
    pros: ['Rear building, so unusually quiet for the area', 'Courtyard and bike storage', 'Open-ended lease suits long stays'],
    tradeoffs: ['Rent is an estimate, not a quoted number', 'Unfurnished and no kitchen appliances stated', 'Two-room layout means one room is a bedroom with a walk-through living space'],
    missing: ['Actual quoted rent from the owner', 'Energy certificate (Energieausweis)', 'Fit-out standard of the kitchen', 'Whether the flat is subject to Mietpreisbremse'],
    photos: ['berlin-courtyard', 'interior-living-1', 'interior-kitchen-1', 'interior-bedroom-1'],
    benchmark: null,
    tags: ['eur', 'apartment', 'unfurnished', 'walkable', 'transit', 'quiet', 'courtyard']
  }),

  demoBase(6, {
    id: 'lon-01',
    title: 'One-bedroom flat on a Islington garden square',
    city: 'London',
    cityId: 'london',
    country: 'United Kingdom',
    countryCode: 'GB',
    area: 'Islington',
    address: 'Fictional address — Flat 4, 18 Example Square, London N1 0AA',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 52,
    floor: '2 of 4 with lift',
    furnishing: 'furnished',
    leaseMonths: 12,
    availableFrom: null,
    rent: { amount: 2150, currency: 'GBP', locale: 'en-GB', kind: 'known', note: 'Rent stated in the sample record, exclusive of council tax and bills.' },
    deposit: { months: 1.15, note: 'Recorded as five weeks, which is the statutory cap for annual rent under £50,000.' },
    fees: [
      fee('Tenancy deposit (5 weeks)', 2475, 'GBP', 'known', 'one-off', 'Held in a deposit protection scheme; the record does not name which one.'),
      fee('Holding deposit', 496, 'GBP', 'known', 'one-off', 'One week; usually offset against the first month.'),
      fee('Council tax (band D)', 176, 'GBP', 'estimate', 'monthly', 'Estimated from the published Band D figure; this home’s band is not stated. Single-occupier discount would reduce it.'),
      fee('Bills (energy + water)', 130, 'GBP', 'estimate', 'monthly', 'Estimated for one occupant; the EPC rating is not stated.'),
      fee('Broadband', 32, 'GBP', 'estimate', 'monthly', 'Estimated from a standard package.'),
      fee('Cleaning at end of tenancy', null, 'GBP', 'unknown', 'one-off', 'Not stated. Such charges cannot be deducted from a deposit beyond fair wear and tear.')
    ],
    amenities: ['Lift', 'Furnished', 'Dishwasher', 'Garden square access', 'Double glazing'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'Angel station (Northern line)', minutes: 9, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h.', note: 'Estimated in code; not a live journey.' },
    walkScore: { score: 96, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Central London residential square: shops, buses and the Northern line within a short walk.', tags: ['walkable', 'transit', 'central', 'green'], note: 'Written for the prototype.' },
    pros: ['Extremely walkable, with a Tube station under 10 minutes away', 'Furnished with a dishwasher', 'Five-week deposit caps the upfront cost'],
    tradeoffs: ['Council tax is an estimate until the band is confirmed', 'No parking stated', '52 m² is compact for a one-bedroom'],
    missing: ['Energy Performance Certificate rating', 'Actual council tax band', 'Deposit protection scheme name', 'Whether the square access is a legal right or a courtesy'],
    photos: ['london-hamilton-terrace', 'interior-living-1', 'interior-bedroom-1', 'interior-kitchen-1'],
    benchmark: 'ons-london',
    tags: ['gbp', 'apartment', 'furnished', 'walkable', 'transit', 'central', 'london']
  }),

  demoBase(7, {
    id: 'tor-01',
    title: 'One-bedroom plus den in a low-rise',
    city: 'Toronto',
    cityId: 'toronto',
    country: 'Canada',
    countryCode: 'CA',
    area: 'Leslieville',
    address: 'Fictional address — Unit 3, 245 Example Street East, Toronto ON M4M 0A0',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 61,
    floor: '3 of 4',
    furnishing: 'unfurnished',
    leaseMonths: 12,
    availableFrom: null,
    status: 'pending',
    rent: { amount: 2450, currency: 'CAD', locale: 'en-CA', kind: 'known', note: 'Rent stated in the sample record, plus utilities. The home is under application, not confirmed let.' },
    deposit: { months: 1, note: 'First and last month required in Ontario; recorded as a one-month equivalent.' },
    fees: [
      fee('First and last month', 4900, 'CAD', 'known', 'one-off', 'Two months collected up front, one of which is the deposit.'),
      fee('Key deposit', 100, 'CAD', 'known', 'one-off', 'Refundable on return of keys; must not exceed replacement cost.'),
      fee('Hydro (electricity)', 85, 'CAD', 'estimate', 'monthly', 'Estimated from comparable one-bedroom units; not metered figures.'),
      fee('Renters insurance', 25, 'CAD', 'estimate', 'monthly', 'Typical tenant liability cover.'),
      fee('Parking', null, 'CAD', 'unknown', 'monthly', 'Street permit only; the record does not state availability or cost.')
    ],
    amenities: ['Den', 'Balcony', 'In-suite laundry', 'Bicycle storage'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'Queen Street East streetcar', minutes: 6, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h.', note: 'Estimated in code.' },
    walkScore: { score: 92, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Leafy east-end neighbourhood with a streetcar line, small shops and ravine access.', tags: ['walkable', 'transit', 'family', 'green'], note: 'Written for the prototype.' },
    pros: ['Den adds a usable office', 'In-suite laundry', 'Streetcar within a short walk'],
    tradeoffs: ['Utilities are separate and estimated', 'Under application, so it may already be gone', 'One bathroom'],
    missing: ['Parking permit cost and availability', 'Whether the landlord is registered for the provincial rent-increase guideline', 'Den dimensions'],
    photos: ['toronto-college', 'interior-living-1', 'interior-bedroom-1', 'interior-kitchen-1'],
    benchmark: null,
    tags: ['cad', 'apartment', 'unfurnished', 'walkable', 'transit', 'den', 'family']
  }),

  demoBase(8, {
    id: 'tky-01',
    title: 'One-bedroom (1LDK) in a Nakameguro low-rise',
    city: 'Tokyo',
    cityId: 'tokyo',
    country: 'Japan',
    countryCode: 'JP',
    area: 'Nakameguro',
    address: 'Fictional address — 302 Example Heights, 2-14-6 Kamimeguro, Meguro-ku, Tokyo 153-0051',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 42,
    floor: '3 of 5',
    furnishing: 'unfurnished',
    leaseMonths: 24,
    availableFrom: null,
    rent: { amount: 218000, currency: 'JPY', locale: 'ja-JP', kind: 'known', note: 'Rent stated in the sample record, plus kanrihi. No key money is stated.' },
    deposit: { months: 1, note: 'Shikikin of one month, as stated.' },
    fees: [
      fee('Shikikin (deposit)', 218000, 'JPY', 'known', 'one-off', 'One month, typically refundable minus cleaning.'),
      fee('Kanrihi (management fee)', 12000, 'JPY', 'known', 'monthly', 'Stated by the agent as ¥12,000 per month.'),
      fee('Key money (reikin)', null, 'JPY', 'unknown', 'one-off', 'Not stated. Where charged it is commonly one to two months and is not refundable.'),
      fee('Agency fee', 114450, 'JPY', 'estimate', 'one-off', 'Half a month plus tax of the ¥218,000 rent. Estimated from custom, not quoted.'),
      fee('Guarantor company fee', 109000, 'JPY', 'estimate', 'one-off', 'Typically 50% of one month; not quoted in the record.'),
      fee('Fire insurance', 20000, 'JPY', 'known', 'annual', 'Two-year policy recorded as an annual equivalent figure stated by the agent.')
    ],
    amenities: ['Auto-lock entrance', 'Separate bath and toilet', 'Reheating bath', 'Delivery box', 'Bicycle parking'],
    amenitiesNote: 'Only amenities named in the record are listed. Japanese listings commonly omit floor area detail; here it is stated.',
    commute: { label: 'Commute estimate', hub: 'Nakameguro station (Hibiya / Tokyu lines)', minutes: 8, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h.', note: 'Estimated in code.' },
    walkScore: { score: 89, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Low-rise riverside district with a canal path, small shops and direct trains to Shibuya.', tags: ['walkable', 'transit', 'local', 'green'], note: 'Written for the prototype.' },
    pros: ['Separate bath and toilet typical of newer Tokyo stock', 'Delivery box and auto-lock', 'Direct trains to Shibuya and Roppongi'],
    tradeoffs: ['Key money and guarantor fee are unknown or estimated, so upfront cost is uncertain', '42 m² is small for two occupants', 'Unfurnished by Japanese custom'],
    missing: ['Whether key money is charged at all', 'Renewal fee at the end of the initial term', 'Earthquake insurance requirement', 'Building age and structure'],
    photos: ['interior-living-1', 'interior-bedroom-1', 'interior-kitchen-1'],
    benchmark: null,
    tags: ['jpy', 'apartment', 'unfurnished', 'transit', 'walkable', 'local']
  }),

  demoBase(9, {
    id: 'dxb-01',
    title: 'One-bedroom with a Marina view',
    city: 'Dubai',
    cityId: 'dubai',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    area: 'Dubai Marina',
    address: 'Fictional address — Apt 1802, Example Tower 2, Marina Walk, Dubai',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 1,
    bathrooms: 2,
    sizeSqm: 76,
    floor: '18 of 32',
    furnishing: 'furnished',
    leaseMonths: 12,
    availableFrom: null,
    rent: {
      amount: null,
      currency: 'AED',
      locale: 'en-AE',
      kind: 'unknown',
      note: 'Rent on application. The record states no figure, so none is shown and none is inferred.'
    },
    deposit: { months: 1, note: 'Security deposit of 5% of annual rent is common; recorded as one month equivalent.' },
    fees: [
      fee('Security deposit', null, 'AED', 'unknown', 'one-off', 'Usually 5% of annual rent, but the rent itself is not stated, so this cannot be computed.'),
      fee('Agency commission', 0, 'AED', 'unknown', 'one-off', 'Commonly 5% plus VAT of annual rent. Cannot be computed without a rent figure.'),
      fee('DEWA connection', null, 'AED', 'unknown', 'one-off', 'Housing fee is 5% of rent added to the electricity bill; not computable here.'),
      fee('Chiller / district cooling', 350, 'AED', 'estimate', 'monthly', 'Estimated from comparable Marina towers; not quoted in the record.'),
      fee('Ejari registration', 220, 'AED', 'known', 'one-off', 'Standard tenancy registration fee, stated in the record.')
    ],
    amenities: ['Gym', 'Shared pool', 'Balcony', 'Covered parking', '24-hour concierge'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'Jumeirah Lakes Towers metro (via tram)', minutes: 16, kind: 'estimate', method: 'Walking and tram estimate at 4.8 km/h walking plus a fixed tram leg.', note: 'Estimated in code.' },
    walkScore: { score: 82, kind: 'estimate', note: 'Prototype estimate. Marina Walk is walkable; the wider area is car-oriented.' },
    neighbourhood: { summary: 'High-density waterfront district with a promenade, metro links and heavy traffic at peak times.', tags: ['walkable', 'transit', 'central', 'waterfront'], note: 'Written for the prototype.' },
    pros: ['Furnished with a pool and gym in the tower', 'Marina Walk promenade on the doorstep', '24-hour concierge'],
    tradeoffs: ['Rent is unknown, so the upfront cost cannot be established at all', 'Chiller charges are a recurring extra that is easy to overlook', 'Peak-hour traffic on Sheikh Zayed Road'],
    missing: ['The rent itself', 'Whether chiller charges are billed by the building or a third party', 'Parking space number and whether it is included'],
    photos: ['dubai-marina', 'dubai-marina-2007', 'interior-living-1', 'interior-kitchen-1'],
    benchmark: null,
    tags: ['aed', 'apartment', 'furnished', 'waterfront', 'gym', 'pool']
  }),

  demoBase(10, {
    id: 'mel-01',
    title: 'Two-bedroom terrace house near Fitzroy North',
    city: 'Melbourne',
    cityId: 'melbourne',
    country: 'Australia',
    countryCode: 'AU',
    area: 'Fitzroy North',
    address: 'Fictional address — 21 Example Terrace, Fitzroy North VIC 3068',
    lat: null,
    lng: null,
    propertyType: 'townhouse',
    bedrooms: 2,
    bathrooms: 1,
    sizeSqm: 96,
    floor: 'Two storeys',
    furnishing: 'unfurnished',
    leaseMonths: 12,
    availableFrom: null,
    rent: { amount: 2780, currency: 'AUD', locale: 'en-AU', kind: 'known', note: 'Rent stated in the sample record, per calendar month. Advertised weekly in Australia; converted here to monthly for comparison, at 52 weeks divided by 12.' },
    deposit: { months: 0.92, note: 'Bond of four weeks, lodged with the Residential Tenancies Bond Authority.' },
    fees: [
      fee('Bond (4 weeks)', 2780, 'AUD', 'known', 'one-off', 'Lodged with the state bond authority; refundable.'),
      fee('Water usage', 45, 'AUD', 'estimate', 'monthly', 'Estimated from comparable two-person households; not metered figures.'),
      fee('Electricity and gas', 140, 'AUD', 'estimate', 'monthly', 'Estimated; the record does not state the energy rating.'),
      fee('Internet', 80, 'AUD', 'estimate', 'monthly', 'Estimated from a standard NBN plan.'),
      fee('Gardening', null, 'AUD', 'unknown', 'monthly', 'Outdoor space is not described beyond the frontage; maintenance responsibility is not stated.')
    ],
    amenities: ['Front garden', 'Off-street parking for one car', 'Dishwasher', 'Split-system heating and cooling'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'North Fitzroy tram (route 96)', minutes: 7, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h.', note: 'Estimated in code.' },
    walkScore: { score: 90, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Victorian terrace streets with a tram line, parkland and a busy local shopping strip.', tags: ['walkable', 'transit', 'family', 'green', 'local'], note: 'Written for the prototype.' },
    pros: ['Front garden and off-street parking', 'Tram within a short walk', 'Two separate bedrooms upstairs'],
    tradeoffs: ['Only one bathroom for a two-storey home', 'Unfurnished', 'Water usage is charged to the tenant in Victoria'],
    missing: ['Garden maintenance responsibility', 'Energy rating', 'Whether the parking space is on title or informal'],
    photos: ['melbourne-elizabeth', 'interior-living-1', 'interior-kitchen-1', 'interior-bedroom-1'],
    benchmark: null,
    tags: ['aud', 'townhouse', 'unfurnished', 'walkable', 'transit', 'garden', 'family']
  }),

  demoBase(11, {
    id: 'nyc-01',
    title: 'One-bedroom in a Park Slope walk-up',
    city: 'New York',
    cityId: 'new-york',
    country: 'United States',
    countryCode: 'US',
    area: 'Park Slope',
    address: 'Fictional address — 3R, 512 Example Avenue, Brooklyn, NY 11215',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 55,
    floor: '3 of 4, walk-up',
    furnishing: 'unfurnished',
    leaseMonths: 12,
    availableFrom: null,
    rent: { amount: 3450, currency: 'USD', locale: 'en-US', kind: 'known', note: 'Rent stated in the sample record. Heat and hot water included; the record does not say whether that is guaranteed by lease.' },
    deposit: { months: 1, note: 'One month security deposit, the New York statutory maximum.' },
    fees: [
      fee('Security deposit', 3450, 'USD', 'known', 'one-off', 'One month, the maximum permitted in New York.'),
      fee('Application / credit check fee', 20, 'USD', 'known', 'one-off', 'The statutory maximum per applicant.'),
      fee("Broker's fee", 3450, 'USD', 'estimate', 'one-off', 'Commonly one month, or 15% of annual rent. Not stated in the record; estimated at one month.'),
      fee('Electricity', 70, 'USD', 'estimate', 'monthly', 'Estimated from comparable one-bedrooms; heat is stated as included.'),
      fee('Internet', 65, 'USD', 'estimate', 'monthly', 'Estimated from a standard plan.'),
      fee('Pet rent', null, 'USD', 'unknown', 'monthly', 'Not stated. Many buildings in this area charge a monthly pet fee.')
    ],
    amenities: ['Heat and hot water included', 'Pre-war details', 'Laundry in building', 'Bike room'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: '7th Avenue F/G station', minutes: 6, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h.', note: 'Estimated in code.' },
    walkScore: { score: 97, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Brownstone Brooklyn: Prospect Park, two subway lines, and a busy restaurant strip on Fifth Avenue.', tags: ['walkable', 'transit', 'family', 'green', 'central'], note: 'Written for the prototype.' },
    pros: ['Heat and hot water included reduces winter risk', 'Two subway lines under 10 minutes away', 'Deposit is capped at one month'],
    tradeoffs: ['A broker fee of a month is likely but unconfirmed, which swings the upfront cost by $3,450', 'Third-floor walk-up', 'No elevator'],
    missing: ['Whether a broker fee applies and how much', 'Pet policy and any pet rent', 'Whether heat being included is written into the lease', 'Square footage verification'],
    photos: ['nyc-brooklyn', 'nyc-brownstone', 'interior-living-1', 'interior-bedroom-1'],
    benchmark: null,
    tags: ['usd', 'apartment', 'unfurnished', 'walkable', 'transit', 'family', 'park']
  }),

  demoBase(12, {
    id: 'mex-01',
    title: 'Two-bedroom with a roof terrace in Roma Norte',
    city: 'Mexico City',
    cityId: 'mexico-city',
    country: 'Mexico',
    countryCode: 'MX',
    area: 'Roma Norte',
    address: 'Fictional address — Depto 4, Calle Inventada 88, Roma Norte, 06700 Ciudad de México',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    sizeSqm: 88,
    floor: '4 of 4 with lift',
    furnishing: 'furnished',
    leaseMonths: 12,
    availableFrom: null,
    rent: { amount: 24500, currency: 'MXN', locale: 'es-MX', kind: 'known', note: 'Rent stated in the sample record, excluding mantenimiento.' },
    deposit: { months: 1, note: 'Un mes de depósito, plus an aval or insurance is commonly required.' },
    fees: [
      fee('Depósito', 24500, 'MXN', 'known', 'one-off', 'Un mes, refundable.'),
      fee('Mantenimiento', 1800, 'MXN', 'known', 'monthly', 'Stated by the owner as $1,800 per month.'),
      fee('Aval / fiador', null, 'MXN', 'unknown', 'one-off', 'Requirement not stated. Without an aval, a rental insurance policy is common and can cost one month.'),
      fee('Servicios (luz, agua, gas)', 1400, 'MXN', 'estimate', 'monthly', 'Estimated for two people; not metered figures.'),
      fee('Internet', 600, 'MXN', 'estimate', 'monthly', 'Estimated from a standard package.')
    ],
    amenities: ['Lift', 'Furnished', 'Roof terrace (shared)', 'Water tank', 'Security door'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'Insurgentes metro (Línea 1)', minutes: 12, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h.', note: 'Estimated in code.' },
    walkScore: { score: 94, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Dense, mixed-use neighbourhood with markets, parks, galleries and heavy afternoon traffic.', tags: ['walkable', 'transit', 'local', 'nightlife'], note: 'Written for the prototype.' },
    pros: ['Furnished and lift-served', 'Shared roof terrace', 'Two bathrooms'],
    tradeoffs: ['An aval requirement could add a month of cost or force an insurance policy', 'Afternoon traffic and noise are not described in the record', 'Water supply interruptions are common in the season and are not mentioned'],
    missing: ['Whether an aval is mandatory', 'Cost of rental insurance if an aval is not available', 'Frequency of water supply interruptions', 'Building age and seismic certification'],
    photos: ['mexico-city-centro', 'interior-living-1', 'interior-kitchen-1', 'interior-bedroom-1'],
    benchmark: null,
    tags: ['mxn', 'apartment', 'furnished', 'walkable', 'transit', 'terrace', 'local']
  }),

  demoBase(13, {
    id: 'ams-01',
    title: 'One-bedroom on a De Pijp side street',
    city: 'Amsterdam',
    cityId: 'amsterdam',
    country: 'Netherlands',
    countryCode: 'NL',
    area: 'De Pijp',
    address: 'Fictional address — 2 hoog, Voorbeeldstraat 31, 1073 Amsterdam',
    lat: null,
    lng: null,
    propertyType: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 58,
    floor: '2 of 3',
    furnishing: 'upholstered',
    furnishingNote: 'Recorded as "gestoffeerd" (upholstered: flooring and curtains provided, no furniture). Treated as semi-furnished for filtering rather than assumed fully furnished.',
    leaseMonths: 24,
    availableFrom: null,
    status: 'withdrawn',
    rent: { amount: 1750, currency: 'EUR', locale: 'nl-NL', kind: 'known', note: 'Rent stated in the sample record. The listing has since been withdrawn, so the figure is historical.' },
    deposit: { months: 2, note: 'Two months deposit, as stated.' },
    fees: [
      fee('Waarborgsom (deposit)', 3500, 'EUR', 'known', 'one-off', 'Two months, refundable.'),
      fee('Servicekosten', 85, 'EUR', 'estimate', 'monthly', 'Estimated for building services; not itemised in the record.'),
      fee('Gemeentelijke belastingen', 480, 'EUR', 'estimate', 'annual', 'Municipal taxes billed to the user; estimated because the actual assessment is not stated.'),
      fee('Energie (gas + electricity)', 165, 'EUR', 'estimate', 'monthly', 'Estimated for a two-person household; the energy label is not stated.'),
      fee('Huisvestingsvergunning', null, 'EUR', 'unknown', 'one-off', 'Some Amsterdam rents require a housing permit with income and household-size rules. The record does not say whether this address needs one.')
    ],
    amenities: ['Balcony', 'Shared courtyard', 'Bicycle storage', 'Double glazing'],
    amenitiesNote: 'Only amenities named in the record are listed.',
    commute: { label: 'Commute estimate', hub: 'De Pijp metro (Noord/Zuidlijn)', minutes: 8, kind: 'estimate', method: 'Walking-distance estimate at 4.8 km/h.', note: 'Estimated in code.' },
    walkScore: { score: 95, kind: 'estimate', note: 'Prototype estimate. Not a Walk Score® product.' },
    neighbourhood: { summary: 'Central Amsterdam: market, trams and canals, with an acute shortage of family-sized homes.', tags: ['walkable', 'transit', 'central', 'local'], note: 'Written for the prototype.' },
    pros: ['Balcony and shared courtyard', 'Metro and a daily market within minutes', 'Long 24-month lease'],
    tradeoffs: ['Withdrawn — cannot be let', 'Possibly needs a housing permit, which is unknown', 'Steep stairs and no lift, as is common in the area'],
    missing: ['Whether a huisvestingsvergunning is required', 'Energy label', 'Exact servicekosten composition'],
    photos: ['amsterdam-canal', 'interior-living-1', 'interior-bedroom-1', 'interior-kitchen-1'],
    benchmark: null,
    tags: ['eur', 'apartment', 'semi-furnished', 'walkable', 'transit', 'central', 'balcony']
  })
];

/** Counts used on the homepage and in the sources page. */
export const DEMO_COUNTS = Object.freeze({
  listings: LISTINGS.length,
  cities: new Set(LISTINGS.map((l) => l.cityId)).size,
  currencies: new Set(LISTINGS.map((l) => l.rent.currency)).size
});

export default LISTINGS;
