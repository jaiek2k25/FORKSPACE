/**
 * Source registry — what FORKSPACE actually uses, and what it does not.
 *
 * Every entry is honest about its own state: a source with no check timestamp
 * is shown as unverified, and a source that is not connected says so instead
 * of implying data is flowing. The sources page renders exactly this list.
 */
import { DEMO_SOURCE } from './demo-source.js';

export const SOURCES = [
  {
    ...DEMO_SOURCE,
    id: 'forkspace-demo',
    kind: 'demo',
    state: 'sample',
    checkable: false,
    lastCheckedAt: null,
    freshnessNote: 'Sample records written for this prototype. Not a data feed.',
    usedFor: 'All 13 homes on this site, the comparison, and the demo research adapter.',
    caveat: 'Fictional addresses, fictional rents. Nothing here has been verified by anyone, and no demo record carries a source URL.',
    attributionRequired: false
  },
  {
    id: 'ons-pipr',
    name: 'Price Index of Private Rents (PIPR)',
    publisher: 'Office for National Statistics (ONS)',
    kind: 'dataset',
    state: 'connected',
    url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
    attribution: 'Source: Office for National Statistics – Price Index of Private Rents, licensed under the Open Government Licence v3.0',
    licence: 'Open Government Licence v3.0',
    licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    termsUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    lastCheckedAt: '2026-10-14T09:15:00.000Z',
    verifiedBy: 'Manual check of the ONS bulletin page for release August 2026 (rent reference period July 2026).',
    usedFor: 'The "Area benchmark · official statistics" block on London home pages.',
    caveat: 'An area average for the whole private rented stock. Not bedroom-specific, not a asking rent, and not a price for any individual home.',
    attributionRequired: true
  },
  {
    id: 'osm-nominatim',
    name: 'OpenStreetMap Nominatim geocoding',
    publisher: 'OpenStreetMap Foundation',
    kind: 'api',
    state: 'not_connected',
    url: 'https://nominatim.org/',
    attribution: '© OpenStreetMap contributors (ODbL)',
    licence: 'Open Database License (ODbL) 1.0',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    termsUrl: 'https://operations.osmfoundation.org/policies/nominatim/',
    lastCheckedAt: null,
    usedFor: 'Optional server-side geocoding of real listing addresses (GET /api/geocode).',
    caveat: 'Disabled unless GEOCODER_CONTACT is configured, because the Nominatim usage policy requires an identifying contact. No demo record is geocoded, and Nominatim is never used for autocomplete or bulk lookups.',
    attributionRequired: true
  },
  {
    id: 'nvidia-endpoint',
    name: 'NVIDIA-hosted chat completions endpoint',
    publisher: 'NVIDIA NIM',
    kind: 'api',
    state: 'not_connected',
    url: 'https://integrate.api.nvidia.com/v1',
    attribution: null,
    licence: 'Provider terms apply to the operator account',
    licenceUrl: null,
    termsUrl: 'https://www.nvidia.com/en-us/about-nvidia/terms-of-service/',
    lastCheckedAt: null,
    usedFor: 'Optional research-assistant adapter that extracts preferences as JSON.',
    caveat: 'Used only when the operator sets NVIDIA_API_KEY. Without a key the assistant runs the deterministic demo adapter and makes no network calls at all.',
    attributionRequired: false
  },
  {
    id: 'licensed-feed-example',
    name: 'Licensed partner feed (not connected)',
    publisher: 'Operator-supplied',
    kind: 'feed',
    state: 'not_connected',
    url: null,
    attribution: 'Set per record in the feed itself',
    licence: 'Set per record in the feed itself',
    licenceUrl: null,
    termsUrl: null,
    lastCheckedAt: null,
    usedFor: 'Nothing yet. This row documents how live listings would arrive.',
    caveat: 'The licensed-file adapter reads JSON exports from a folder that is not web-served and rejects any record missing a source name, kind, attribution or licence. The REST adapter is disabled until credentials are configured, uses HTTPS only and refuses redirects. No listing-site scraping is supported or shipped.',
    attributionRequired: true
  },
  {
    id: 'commons-photos',
    name: 'Photography from Wikimedia Commons',
    publisher: 'Wikimedia Commons contributors',
    kind: 'dataset',
    state: 'connected',
    url: 'https://commons.wikimedia.org/',
    attribution: 'Individual photographers, credited per photograph — see the photography credits list.',
    licence: 'CC0 / CC BY / CC BY-SA / public domain only (no NC, no ND)',
    licenceUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing',
    termsUrl: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
    lastCheckedAt: '2026-10-14T09:05:00.000Z',
    verifiedBy: 'Licence and author of each file read from the Commons API before inclusion.',
    usedFor: 'City photographs and illustrative interiors on cards and galleries.',
    caveat: 'These photographs show places, not the fictional homes in this dataset. Every gallery is captioned "Illustrative photos · not of this specific home".',
    attributionRequired: true
  },
  {
    id: 'static-fx',
    name: 'Illustrative FX table',
    publisher: 'Shipped with this build',
    kind: 'manual',
    state: 'connected',
    url: null,
    attribution: 'Hard-coded table in assets/js/data/fx.js',
    licence: 'Demo content — no rights claimed',
    licenceUrl: null,
    termsUrl: null,
    lastCheckedAt: '2026-10-01T00:00:00.000Z',
    verifiedBy: null,
    usedFor: 'Converting budget filters and cross-currency comparisons.',
    caveat: 'Not a live rate feed. Every converted figure is labelled as illustrative, with the rate date shown. Amounts are never presented as current market rates.',
    attributionRequired: false
  }
];

export function sourceById(id) {
  return SOURCES.find((source) => source.id === id) || null;
}
