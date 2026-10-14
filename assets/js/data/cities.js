/**
 * Destination list for the homepage, derived from the demo dataset so the
 * counts can never drift from the records. `photoId` is the cleared
 * representation for the city; null means no openly licensed photograph of
 * that city has been cleared for this prototype yet, and the tile says so
 * instead of borrowing a picture of somewhere else.
 */
import { LISTINGS } from './listings.js';

export const CITY_PHOTOS = Object.freeze({
  coimbatore: 'coimbatore-street',
  bengaluru: 'bengaluru-towers',
  lisbon: 'lisbon-facade',
  berlin: 'berlin-courtyard',
  london: 'london-hamilton-terrace',
  toronto: 'toronto-college',
  tokyo: null,
  dubai: 'dubai-marina',
  melbourne: 'melbourne-elizabeth',
  'new-york': 'nyc-brooklyn',
  'mexico-city': 'mexico-city-centro',
  amsterdam: 'amsterdam-canal'
});

export const CITIES = [...new Map(LISTINGS.map((listing) => [listing.cityId, listing])).values()].map((listing) => ({
  id: listing.cityId,
  name: listing.city,
  country: listing.country,
  countryCode: listing.countryCode,
  count: LISTINGS.filter((item) => item.cityId === listing.cityId).length,
  currency: listing.rent.currency,
  photoId: CITY_PHOTOS[listing.cityId] ?? null
}));

export function cityById(id) {
  return CITIES.find((city) => city.id === id) || null;
}

export const CITY_OPTIONS = CITIES.map((city) => ({ value: city.id, label: city.name }));

export const CITIES_WITHOUT_PHOTO = CITIES.filter((city) => !city.photoId).map((city) => city.name);
