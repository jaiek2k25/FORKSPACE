/**
 * Maps: Leaflet served from this origin, tiles from one configured host.
 *
 * Why it is built this way:
 *
 *   - Leaflet itself is vendored into `assets/vendor/leaflet/`, so the page loads
 *     no third-party script, style or font. The Content-Security-Policy keeps
 *     `script-src 'self'` and `style-src 'self'` intact.
 *   - Tiles are the one remote image the policy allows, and only from the single
 *     origin the server reports. Nothing else in the interface makes a remote
 *     request.
 *   - Attribution is always on and is never placed behind a control: the tiles are
 *     ODbL data from donated servers, and hiding the credit would breach the terms
 *     the data is available under.
 *   - No clustering, no nearby-property overlay, no data harvesting. A pin is drawn
 *     only for a record that carries a checked location, which the schema enforces.
 *
 * The module degrades rather than throws: if Leaflet cannot be loaded, or the map
 * cannot be created, it resolves to null and the caller renders the written
 * explanation instead.
 */
import { el } from './dom.js';
import { api } from './api.js';

export const LEAFLET_BASE = 'assets/vendor/leaflet/';
export const LEAFLET_CSS = `${LEAFLET_BASE}leaflet.css`;
export const LEAFLET_JS = `${LEAFLET_BASE}leaflet.js`;

/** The tile policy's own wording, so a credit can never be written by hand. */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

/** Fallbacks if the server sends no map configuration (for example, an offline shell). */
export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DEFAULT_MAX_ZOOM = 19;
export const DEFAULT_MIN_ZOOM = 3;

const LEAFLET_LOAD_TIMEOUT_MS = 12000;

let leafletPromise = null;
let tileConfigPromise = null;
const liveMaps = new Set();

/**
 * Load Leaflet once, from this origin. Resolves with `window.L`, or null if it
 * cannot be loaded — a missing map must never break a page.
 */
export function loadLeaflet() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (window.L?.map) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(window.L?.map ? window.L : null), LEAFLET_LOAD_TIMEOUT_MS);

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      link.dataset.forkspaceLeaflet = 'css';
      document.head.append(link);
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.dataset.forkspaceLeaflet = 'js';
    script.addEventListener('load', () => finish(window.L?.map ? window.L : null));
    script.addEventListener('error', () => finish(null));
    document.head.append(script);
  }).then((L) => {
    if (!L) leafletPromise = null; // allow a later attempt (for example, offline start)
    else if (L.Icon?.Default) L.Icon.Default.imagePath = `${LEAFLET_BASE}images/`;
    return L;
  });

  return leafletPromise;
}

/** A pin for one home. Styled by this app's stylesheet, not by Leaflet's defaults. */
function locationPin(L, label) {
  return L.divIcon({
    className: 'map-pin',
    html: `<span class="map-pin__dot" aria-hidden="true"></span><span class="map-pin__label">${label ? label.replace(/[<>&]/g, '') : ''}</span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

/**
 * Build a map inside `container`.
 *
 * @param {HTMLElement} container
 * @param {object} options
 * @param {{lat: number, lng: number}} options.center
 * @param {number} options.zoom
 * @param {{lat: number, lng: number, label?: string}|null} [options.marker] one pin, or none
 * @param {object} [options.tiles] server-provided tile configuration
 * @returns {Promise<object|null>} the Leaflet map, or null if it could not be built
 */
export async function createRentalMap(container, { center, zoom = 12, marker = null, tiles = {}, onTilesUnavailable = null } = {}) {
  if (!container || typeof container.append !== 'function' || !center) return null;
  const config = tiles || {};
  // A server that has switched tiles off is obeyed: no remote request is made.
  if (config.enabled === false) return null;
  const L = await loadLeaflet();
  if (!L || !container.isConnected) return null;

  const tileUrl = config.tileUrl || DEFAULT_TILE_URL;
  const attribution = config.attribution && config.attributionUrl
    ? `${config.attribution} (<a href="${config.attributionUrl}" target="_blank" rel="noopener">licence</a>)`
    : OSM_ATTRIBUTION + ` (<a href="${OSM_ATTRIBUTION_URL}" target="_blank" rel="noopener">licence</a>)`;

  let map;
  try {
    map = L.map(container, {
      center: [center.lat, center.lng],
      zoom,
      minZoom: config.minZoom ?? DEFAULT_MIN_ZOOM,
      maxZoom: config.maxZoom ?? DEFAULT_MAX_ZOOM,
      // Keyboard and the zoom buttons work; the scroll wheel does not hijack the
      // page, which is the behaviour a map inside a list of results should have.
      scrollWheelZoom: false,
      keyboard: true,
      zoomControl: true,
      // Attribution is mandatory for this data and is not optional here.
      attributionControl: true,
      // Marker images are served from this origin, like everything else.
      tap: false
    });

    const layer = L.tileLayer(tileUrl, {
      maxZoom: config.maxZoom ?? DEFAULT_MAX_ZOOM,
      attribution,
      // Tiles are cached by the browser using the server's own cache headers.
      // Nothing here disables or bypasses that cache.
      crossOrigin: false
    }).addTo(map);

    /**
     * A tile server that cannot be reached must not leave a silent grey rectangle.
     * If nothing has loaded a few seconds after the first failure, the panel is told
     * so in words — the credit stays visible either way, because it applies whenever
     * a tile is shown.
     */
    let loaded = 0;
    let reported = false;
    const reportIfDead = () => {
      if (reported || loaded > 0 || !container.isConnected) return;
      reported = true;
      onTilesUnavailable?.();
    };
    layer.on('tileload', () => { loaded += 1; });
    layer.on('tileerror', () => { window.setTimeout(reportIfDead, 4000); });

    if (marker && Number.isFinite(marker.lat) && Number.isFinite(marker.lng)) {
      L.marker([marker.lat, marker.lng], { icon: locationPin(L, marker.label), title: marker.label || 'Location' })
        .addTo(map);
    }
  } catch {
    return null;
  }

  liveMaps.add(map);
  return map;
}

/**
 * Leaflet holds window and document listeners per map, so maps are removed when
 * the view that owns them goes away. Called by the router before each render.
 */
export function destroyAllMaps() {
  for (const map of liveMaps) {
    try {
      map.remove();
    } catch {
      // A map whose container is already detached is nothing to worry about.
    }
  }
  liveMaps.clear();
}

export function liveMapCount() {
  return liveMaps.size;
}

/**
 * The server's tile configuration, fetched once per page and shared by every map.
 * Asking the server (rather than hard-coding a tile URL) is what lets an operator
 * change provider without shipping new client code.
 */
export function tileConfig() {
  if (!tileConfigPromise) {
    tileConfigPromise = api.geoStatus().then((result) => {
      if (!result.ok) return { enabled: false, unreachable: true };
      return result.data?.map || { enabled: false };
    });
  }
  return tileConfigPromise;
}

/** A fresh attempt, used when a reader retries after a failure. */
export function resetTileConfig() {
  tileConfigPromise = null;
}

/**
 * The location a record actually has, or null.
 *
 * Only a record that carries checked coordinates gets a map. A demo record cannot
 * pass the schema with coordinates at all, and the check is repeated here so a
 * record reaching the view by another route is still filtered out.
 */
export function locationOf(listing) {
  const coordinates = listing?.coordinates;
  if (!coordinates || listing?.provenance?.isDemo) return null;
  const { lat, lng, source, checkedAt } = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (typeof source !== 'string' || typeof checkedAt !== 'string') return null;
  return {
    lat,
    lng,
    source,
    checkedAt,
    note: typeof coordinates.note === 'string' ? coordinates.note : ''
  };
}

export function hasLocation(listing) {
  return locationOf(listing) !== null;
}

/** A short, human line describing where a plotted coordinate came from. */
export function locationSourceLine(location) {
  if (!location) return '';
  const when = new Date(location.checkedAt);
  const date = Number.isNaN(when.getTime())
    ? 'an unrecorded date'
    : when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Plotted from coordinates supplied by ${location.source}, checked ${date}.`;
}

/**
 * The written explanation shown wherever a map is not drawn. One copy, so the
 * reason is identical on every page that needs it.
 */
export function noMapPanel({ city = '', cityLabel = '', canMap = true } = {}) {
  const text = city
    ? 'No home in this dataset carries a verified location, so nothing is plotted on this map. The marker you would normally see here comes from the record\'s own coordinates, which arrive with real listing data.'
    : 'Demo records carry no coordinates and no verified address, so no home can be plotted and no map provider is called for them.';
  return el('div', { class: 'map-note' },
    el('p', { class: 'map-note__title' }, city ? `Map of ${cityLabel || city} · nothing plotted` : 'No map for these records'),
    el('p', null, text),
    el('p', null, 'Maps apply only to real listing addresses. FORKSPACE never scrapes a map service, and positioning data is never guessed.')
  );
}

/**
 * Shown when the tile host cannot be reached. It says what happened rather than
 * leaving an unexplained blank rectangle, and it does not blame the reader.
 */
export function tilesUnavailableNote(tileHost = '') {
  // The host is named so a reader can see exactly what was not reachable.

  return el('div', { class: 'map-frame__warning', role: 'status' },
    el('p', null, `The map tiles could not be loaded from ${tileHost || 'the tile server'} in this browser, so the map area is blank.`),
    el('p', null, 'Everything else on this page is unaffected, and the credit below still applies to the map data whenever it does load. A blocked network, an offline connection or a strict privacy setting can all cause this.')
  );
}

export { tilesUnavailableNote as offlineNote };

/** The host part of a tile template, for messages that name where tiles come from. */
export function tileHostOf(tileUrl = '') {
  try {
    return new URL(tileUrl).host;
  } catch {
    return '';
  }
}
