/**
 * Photo registry.
 *
 * Every photograph in FORKSPACE is a real, openly licensed photograph of a
 * *place*, used to illustrate the prototype. None of them shows any of the
 * fictional homes in this dataset, and the interface says so on every gallery:
 * "Illustrative photos · not of this specific home".
 *
 * Only these licences are used: CC0, CC BY, CC BY-SA, public domain.
 * No NC (non-commercial) and no ND (no-derivatives) material is included.
 * Every entry records the author, the licence and the source page.
 */
export const PHOTO_DISCLOSURE = 'Illustrative photos · not of this specific home';

const COMMONS = 'Wikimedia Commons';

export const PHOTOS = Object.freeze({
  'coimbatore-street': {
    src: 'assets/photos/coimbatore-street.jpg',
    width: 500,
    height: 333,
    alt: 'Street scene with shopfronts and parked vehicles in Coimbatore, India',
    depicts: 'A street in Coimbatore, Tamil Nadu, India',
    credit: 'Matthew T Rader',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:A_street_scene_in_Coimbatore,_Tamil_Nadu,_India.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'bengaluru-towers': {
    src: 'assets/photos/bengaluru-towers.jpg',
    width: 900,
    height: 506,
    alt: 'Two tall modern apartment towers photographed from below in Bengaluru',
    depicts: 'Apartment towers in Bengaluru, India',
    credit: 'Bharatahs',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Twin_apartment_buildings_in_Bengaluru_City.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'lisbon-facade': {
    src: 'assets/photos/lisbon-facade.jpg',
    width: 500,
    height: 671,
    alt: 'Rear façade of a yellow-tiled apartment building in Lisbon',
    depicts: 'An apartment building near Jardim Fernando Pessa, Lisbon, Portugal',
    credit: 'Jules Verne Times Two',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Back_fa%C3%A7ade_of_yellow_building_near_Jardim_Fernando_Pessa,_Lisbon,_Portugal_julesvernex2.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'lisbon-avenida': {
    src: 'assets/photos/lisbon-avenida.jpg',
    width: 500,
    height: 1001,
    alt: 'Tall tiled rear façade of a Lisbon apartment block with balconies',
    depicts: 'A building on Avenida de Roma, Lisbon, Portugal',
    credit: 'Jules Verne Times Two',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Building_back_fa%C3%A7ade,_Avenida_de_Roma,_Lisbon,_Portugal_julesvernex2.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'berlin-courtyard': {
    src: 'assets/photos/berlin-courtyard.jpg',
    width: 500,
    height: 375,
    alt: 'Berlin apartment block corner with shops at street level',
    depicts: 'An apartment building on Warschauer Straße, Berlin, Germany',
    credit: 'Mark Ahsmann',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Apartment_building_Warschauer_Stra%C3%9Fe_16-Gr%C3%BCnberger_Stra%C3%9Fe_32_in_Berlin_in_June_2008.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'london-hamilton-terrace': {
    src: 'assets/photos/london-hamilton-terrace.jpg',
    width: 500,
    height: 375,
    alt: 'Stucco-fronted terraced houses on a London street',
    depicts: 'Houses on Hamilton Terrace, London NW8, United Kingdom',
    credit: 'JThomas',
    licence: 'CC BY-SA 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Houses_on_Hamilton_Terrace,_London_NW8_-_geograph.org.uk_-_5316774.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'toronto-college': {
    src: 'assets/photos/toronto-college.jpg',
    width: 500,
    height: 697,
    alt: 'Mid-rise brick corner building with large windows in Toronto',
    depicts: 'The former Radio College of Canada building on College Street, Toronto, Canada (photographed c. 1982)',
    credit: 'Btouzel',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Radio_College_of_Canada_building_circa_1982_located_on_College_Street_in_Toronto,_Ontario,_Canada.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'dubai-marina': {
    src: 'assets/photos/dubai-marina.jpg',
    width: 500,
    height: 667,
    alt: 'High-rise towers of Dubai Marina seen from below',
    depicts: 'Dubai Marina, Dubai, United Arab Emirates',
    credit: 'Norlando Pobre',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dubai_Marina_Skyline_(3to4).jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'dubai-marina-2007': {
    src: 'assets/photos/dubai-marina-2007.jpg',
    width: 500,
    height: 345,
    alt: 'Dubai Marina skyline photographed from the water in 2007',
    depicts: 'Dubai Marina skyline, Dubai, United Arab Emirates (2007)',
    credit: 'Imre Solt',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dubai_Marina_Skyline_on_7_September_2007_Pict_2.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'melbourne-elizabeth': {
    src: 'assets/photos/melbourne-elizabeth.jpg',
    width: 500,
    height: 375,
    alt: 'Heritage shopfronts and upper storeys along a Melbourne street',
    depicts: 'Heritage buildings on Elizabeth Street, Melbourne, Australia',
    credit: 'Philip Mallis',
    licence: 'CC BY-SA 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Heritage_buildings_on_Elizabeth_Street,_Melbourne_(40745323523).jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'melbourne-collins': {
    src: 'assets/photos/melbourne-collins.jpg',
    width: 500,
    height: 750,
    alt: 'Narrow mid-century city building façade in Melbourne',
    depicts: "'Francis House' at 107 Collins Street, Melbourne, Australia",
    credit: 'Philip Mallis',
    licence: 'CC BY-SA 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:%27Francis_House%27_building_at_107_Collins_Street,_Melbourne.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'nyc-brooklyn': {
    src: 'assets/photos/nyc-brooklyn.jpg',
    width: 500,
    height: 375,
    alt: 'Street architecture with brick buildings in Brooklyn, New York',
    depicts: 'Street architecture in Brooklyn, New York, United States',
    credit: 'GK tramrunner RU',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Street_architecture_in_Brooklyn,_New_York.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'nyc-brownstone': {
    src: 'assets/photos/nyc-brownstone.jpg',
    width: 500,
    height: 667,
    alt: 'Brick brownstone with bay windows in Brooklyn, New York',
    depicts: 'A brownstone in Brighton Beach, Brooklyn, New York, United States',
    credit: 'Adam Jones (Adam63)',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:New_York_City_-_Brighton_Beach_Brownstone.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  },
  'mexico-city-centro': {
    src: 'assets/photos/mexico-city-centro.jpg',
    width: 500,
    height: 375,
    alt: 'Corner building with shops in the historic centre of Mexico City',
    depicts: 'The "Nuevo Mundo" building in the Centro of Mexico City, Mexico',
    credit: 'Thelmadatter',
    licence: 'Public domain',
    licenceUrl: null,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:BldgNuevoMundoCentroDF.JPG',
    sourceName: COMMONS,
    attributionRequired: false
  },
  'amsterdam-canal': {
    src: 'assets/photos/amsterdam-canal.jpg',
    width: 500,
    height: 375,
    alt: 'Canal with houseboats and historic buildings in Amsterdam',
    depicts: 'The Nieuwe Keizersgracht canal, Amsterdam, Netherlands',
    credit: 'Fons Heijnsbroek',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:2015_-_photo_of_canal_Nieuwe_Keizersgracht_with_houseboats_in_the_Plantage_district_in_Amsterdam_city_with_historical_protestant_buildings_in_the_background_-_street_photography_in_free_download_by_Fons_Heijnsbroek.jpg',
    sourceName: COMMONS,
    attributionRequired: false
  },
  'interior-living-1': {
    src: 'assets/photos/interior-living-1.jpg',
    width: 500,
    height: 272,
    alt: 'Living room with a sofa, chairs and a large window',
    depicts: 'A living room in an apartment in Rio de Janeiro, Brazil',
    credit: 'Wilfredor',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Living_room_in_apartment_of_Condom%C3%ADnio_do_Edif%C3%ADcio_Zaher,_Le_Blond,_Rio_de_Janeiro,_Brazil.jpg',
    sourceName: COMMONS,
    attributionRequired: false
  },
  'interior-bedroom-1': {
    src: 'assets/photos/interior-bedroom-1.jpg',
    width: 500,
    height: 666,
    alt: 'Bedroom with a bed beside a tall window letting in daylight',
    depicts: 'A bedroom interior',
    credit: 'Viktoria Hall-Waldhauser',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bedroom_window_(Unsplash).jpg',
    sourceName: COMMONS,
    attributionRequired: false
  },
  'interior-kitchen-1': {
    src: 'assets/photos/interior-kitchen-1.jpg',
    width: 500,
    height: 333,
    alt: 'Compact kitchen with pale cabinets opening onto a living area',
    depicts: 'A kitchen and living area in a manufactured home',
    credit: 'Riverview Homes, Inc.',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kitchen_and_Living_Room_Singlewide.jpg',
    sourceName: COMMONS,
    attributionRequired: true
  }
});

export const PHOTO_IDS = Object.keys(PHOTOS);

/** Grouped by licence, for the sources page. */
export function photosByLicence() {
  const groups = new Map();
  for (const [id, photo] of Object.entries(PHOTOS)) {
    const key = photo.licence;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, ...photo });
  }
  return [...groups.entries()]
    .map(([licence, photos]) => ({ licence, photos }))
    .sort((a, b) => a.licence.localeCompare(b.licence));
}

export function photoById(id) {
  return PHOTOS[id] || null;
}

/** Credits line for one photo, e.g. "Mark Ahsmann · CC BY-SA 3.0 · Wikimedia Commons". */
export function creditLine(photo) {
  if (!photo) return '';
  const parts = [photo.credit, photo.licence, photo.sourceName];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Photography used by a listing, with credits. Returns an empty array when a
 * listing has no photographs cleared for it.
 */
export function photosForListing(listing) {
  const ids = Array.isArray(listing?.photos) ? listing.photos : [];
  return ids.map((id) => photoById(id)).filter(Boolean);
}
