/**
 * Approximate city centres, for orienting a map.
 *
 * These are NOT listing locations. Nothing in the demo dataset has a verified
 * address, and `schema.js` refuses to accept coordinates on a demo record at all,
 * so these figures exist only so the map view can show a real map of a real city
 * while saying plainly that no home is plotted on it.
 *
 * Rounded to three decimal places — roughly a 100 m grid — because more precision
 * would suggest a survey this table is not. The values are public geographic
 * knowledge (city hall or main square, the usual "city centre" point), recorded
 * here as a static, dated table in the same spirit as the illustrative FX table.
 */
export const CITY_CENTRES_DATED = '2026-10-14';

export const CITY_CENTRES = Object.freeze({
  coimbatore: Object.freeze({ lat: 11.002, lng: 76.962, name: 'Town Hall area' }),
  bengaluru: Object.freeze({ lat: 12.972, lng: 77.594, name: 'MG Road area' }),
  lisbon: Object.freeze({ lat: 38.708, lng: -9.139, name: 'Baixa' }),
  berlin: Object.freeze({ lat: 52.519, lng: 13.405, name: 'Mitte' }),
  london: Object.freeze({ lat: 51.507, lng: -0.128, name: 'Charing Cross' }),
  toronto: Object.freeze({ lat: 43.653, lng: -79.383, name: 'Downtown' }),
  tokyo: Object.freeze({ lat: 35.682, lng: 139.752, name: 'Chiyoda' }),
  dubai: Object.freeze({ lat: 25.204, lng: 55.271, name: 'Deira / Creek' }),
  melbourne: Object.freeze({ lat: -37.814, lng: 144.963, name: 'CBD' }),
  'new-york': Object.freeze({ lat: 40.713, lng: -74.006, name: 'Lower Manhattan' }),
  'mexico-city': Object.freeze({ lat: 19.433, lng: -99.133, name: 'Centro Histórico' }),
  amsterdam: Object.freeze({ lat: 52.373, lng: 4.892, name: 'Dam Square' })
});

/** Zoom that shows a whole city rather than a street. */
export const CITY_ZOOM = 12;

export function cityCentre(cityId) {
  return CITY_CENTRES[cityId] || null;
}

export const CITY_CENTRE_DISCLOSURE =
  'City centre, rounded to about 100 m. It is not the location of any home here: this dataset\'s addresses are invented, so no home is plotted.';
