/**
 * Search results.
 *
 * The filter state lives in the URL, so a result set can be linked to. Filters
 * update the visible results immediately (no submit button) and chips show what is
 * active. "Reset all" clears everything.
 *
 * The map tab is a real OpenStreetMap map drawn with a locally served Leaflet.
 * Nothing is plotted on it, because no record here has a checked location, and the
 * panel says so rather than leaving a reader to assume the pins are missing by
 * accident. When an operator narrows to one city the map centres on that city's
 * approximate centre, also labelled as such.
 */
import { el, fragment, on, replace } from '../lib/dom.js';
import { icon } from '../components/icons.js';
import { listingCard, kindTag } from '../components/cards.js';
import {
  DEFAULT_FILTERS, SORTS, parseFilters, filtersToParams, activeChips, filterListings,
  sortListings, sortByRelevance, PROPERTY_TYPE_OPTIONS, FURNISHING_OPTIONS, displayBudget, budgetNote
} from '../lib/filters.js';
import { LISTINGS } from '../data/listings.js';
import { CITIES } from '../data/cities.js';
import { CURRENCIES, toInr, FX_RATES_AS_OF } from '../data/fx.js';
import { formatMoney, formatNumber, pluralise } from '../data/format.js';
import { STATUS_LABELS } from '../data/schema.js';
import { loadState, COMPARE_MAX, clearCompared } from '../lib/store.js';
import { createRentalMap, offlineNote, tileConfig, tileHostOf, OSM_ATTRIBUTION, OSM_ATTRIBUTION_URL } from '../lib/map.js';
import { cityCentre, CITY_ZOOM, CITY_CENTRE_DISCLOSURE, CITY_CENTRES_DATED } from '../data/city-centres.js';

const RENT_STEPS = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000];

function rentPresets(currency) {
  // Presets are stored in INR; the labels are converted for display.
  return [10000, 25000, 50000, 100000, 200000, 400000].map((inr) => ({
    inr,
    label: `${formatMoney(displayBudget(inr, currency), currency)} / month`
  }));
}

export function renderSearch({ route, navigate, data, onStoreChange, notify }) {
  let filters = parseFilters(route.params);
  let sort = route.params.get('sort') || 'relevance';
  let view = route.params.get('view') === 'map' ? 'map' : 'list';
  let loading = true;

  const root = el('div', { class: 'search' });
  const controlsSlot = el('div', { class: 'search__controls' });
  const chipsSlot = el('div', { class: 'search__chips' });
  const resultsSlot = el('div', { class: 'search__results' });
  const compareSlot = el('div', { class: 'compare-bar-slot' });

  /**
   * The tile URL and the attribution come from the server, so a provider can be
   * switched from configuration without shipping new client code. Until the
   * answer arrives the map tab shows its written explanation.
   */
  let mapTiles = null;
  let mapTilesRequested = false;
  function ensureMapConfig() {
    if (mapTilesRequested) return;
    mapTilesRequested = true;
    // Failing closed: without a confirmed tile origin and credit, no remote request
    // is made at all, and the panel says why.
    tileConfig().then((config) => {
      mapTiles = config;
      if (view === 'map' && root.isConnected) renderAll();
    });
  }

  function syncUrl() {
    const params = filtersToParams(filters, sort);
    if (view === 'map') params.set('view', 'map');
    const query = params.toString();
    const next = query ? `#/search?${query}` : '#/search';
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }

  function update(nextFilters, { render = true } = {}) {
    filters = { ...nextFilters };
    syncUrl();
    if (render) renderAll();
  }

  function setFilter(key, value) {
    update({ ...filters, [key]: value });
  }

  function toggleListValue(key, value) {
    const list = new Set(filters[key] || []);
    if (list.has(value)) list.delete(value);
    else list.add(value);
    update({ ...filters, [key]: [...list] });
  }

  function resetAll() {
    filters = { ...DEFAULT_FILTERS };
    sort = 'relevance';
    update(filters);
    notify?.('All filters cleared.', 'info');
  }

  /* --- filter controls --------------------------------------------------- */

  function cityCheckboxes() {
    return el('fieldset', { class: 'fieldset' },
      el('legend', { class: 'fieldset__legend' }, 'City'),
      el('div', { class: 'checkbox-grid' }, ...CITIES.map((city) =>
        el('label', { class: 'checkbox' },
          el('input', {
            type: 'checkbox',
            checked: filters.cities.includes(city.id),
            onChange: () => toggleListValue('cities', city.id)
          }),
          el('span', null, city.name)
        )))
    );
  }

  function statusCheckboxes() {
    const statuses = ['sample', 'available', 'pending', 'let', 'withdrawn'];
    return el('fieldset', { class: 'fieldset' },
      el('legend', { class: 'fieldset__legend' }, 'Listing status'),
      el('div', { class: 'checkbox-grid' }, ...statuses.map((status) =>
        el('label', { class: 'checkbox' },
          el('input', {
            type: 'checkbox',
            checked: filters.statuses.includes(status),
            onChange: () => toggleListValue('statuses', status)
          }),
          el('span', null, STATUS_LABELS[status] || status)
        )))
    );
  }

  function rentControls() {
    const currency = filters.displayCurrency || 'INR';
    const currencySelect = el('select', {
      class: 'input input--compact',
      'aria-label': 'Currency for the rent range',
      onChange: (event) => update({ ...filters, displayCurrency: event.target.value })
    }, ...CURRENCIES.map((code) => el('option', { value: code, selected: code === currency }, code)));

    const minInput = el('input', {
      class: 'input input--compact',
      type: 'number',
      min: '0',
      step: '100',
      placeholder: 'No minimum',
      'aria-label': 'Minimum monthly rent',
      value: filters.rentMinInr ? String(displayBudget(filters.rentMinInr, currency)) : '',
      onChange: (event) => {
        const value = event.target.value === '' ? null : Number(event.target.value);
        setFilter('rentMinInr', value === null ? null : Math.round(toInr(value, currency)));
      }
    });
    const maxInput = el('input', {
      class: 'input input--compact',
      type: 'number',
      min: '0',
      step: '100',
      placeholder: 'No maximum',
      'aria-label': 'Maximum monthly rent',
      value: filters.rentMaxInr ? String(displayBudget(filters.rentMaxInr, currency)) : '',
      onChange: (event) => {
        const value = event.target.value === '' ? null : Number(event.target.value);
        setFilter('rentMaxInr', value === null ? null : Math.round(toInr(value, currency)));
      }
    });

    return el('div', { class: 'filter-block' },
      el('div', { class: 'filter-block__head' },
        el('h2', { class: 'filter-block__title' }, 'Rent range'),
        currencySelect
      ),
      el('div', { class: 'field__range-inputs' }, minInput, el('span', { class: 'field__range-sep' }, 'to'), maxInput),
      el('div', { class: 'preset-row' }, ...rentPresets(currency).map((preset) =>
        el('button', {
          type: 'button',
          class: ['chip chip--quiet', filters.rentMaxInr === preset.inr ? 'is-active' : null],
          'aria-pressed': filters.rentMaxInr === preset.inr ? 'true' : 'false',
          onClick: () => setFilter('rentMaxInr', filters.rentMaxInr === preset.inr ? null : preset.inr)
        }, `under ${preset.label}`)
      )),
      el('p', { class: 'field__hint' }, budgetNote('INR', currency) + ` Static rate date ${FX_RATES_AS_OF}.`)
    );
  }

  function propertyControls() {
    const typeSelect = el('select', {
      class: 'input',
      'aria-label': 'Property type',
      onChange: (event) => setFilter('types', event.target.value ? [event.target.value] : [])
    },
      el('option', { value: '' }, 'Any property type'),
      ...PROPERTY_TYPE_OPTIONS.map((value) => el('option', { value, selected: filters.types.includes(value) }, value))
    );
    const bedSelect = el('select', {
      class: 'input',
      'aria-label': 'Minimum bedrooms',
      onChange: (event) => setFilter('bedroomsMin', event.target.value ? Number(event.target.value) : null)
    },
      el('option', { value: '' }, 'Any number of bedrooms'),
      ...[0, 1, 2, 3, 4].map((value) => el('option', {
        value: String(value),
        selected: filters.bedroomsMin === value
      }, value === 0 ? 'Studio' : `${value}+ bedrooms`))
    );
    const furnishSelect = el('select', {
      class: 'input',
      'aria-label': 'Furnished status',
      onChange: (event) => setFilter('furnishing', event.target.value ? [event.target.value] : [])
    },
      el('option', { value: '' }, 'Any furnishing'),
      ...FURNISHING_OPTIONS.map((value) => el('option', { value, selected: filters.furnishing.includes(value) }, value))
    );
    const leaseSelect = el('select', {
      class: 'input',
      'aria-label': 'Minimum lease duration',
      onChange: (event) => setFilter('leaseMonthsMin', event.target.value ? Number(event.target.value) : null)
    },
      el('option', { value: '' }, 'Any lease length'),
      ...[3, 6, 11, 12, 24].map((value) => el('option', {
        value: String(value),
        selected: filters.leaseMonthsMin === value
      }, `${value}+ months`))
    );

    return el('div', { class: 'filter-block' },
      el('h2', { class: 'filter-block__title' }, 'Property'),
      el('div', { class: 'filter-block__stack' }, typeSelect, bedSelect, furnishSelect, leaseSelect)
    );
  }

  function buildControls() {
    const queryInput = el('input', {
      class: 'input input--search',
      type: 'search',
      value: filters.q,
      placeholder: 'City, neighbourhood, address or destination',
      'aria-label': 'Search destinations',
      onInput: (event) => {
        // Debounced through requestAnimationFrame: results update as you type.
        const value = event.target.value;
        if (queryInput._timer) window.clearTimeout(queryInput._timer);
        queryInput._timer = window.setTimeout(() => setFilter('q', value), 120);
      }
    });

    const sortSelect = el('select', {
      class: 'input input--compact',
      'aria-label': 'Sort results',
      onChange: (event) => {
        sort = event.target.value;
        syncUrl();
        renderAll();
      }
    }, ...SORTS.map((option) => el('option', { value: option.id, selected: option.id === sort }, option.label)));

    const listButton = el('button', {
      type: 'button',
      class: ['segmented__button', view === 'list' ? 'is-active' : null],
      'aria-pressed': view === 'list' ? 'true' : 'false',
      onClick: () => {
        view = 'list';
        syncUrl();
        renderAll();
      }
    }, icon('list', 16), 'List');
    const mapButton = el('button', {
      type: 'button',
      class: ['segmented__button', view === 'map' ? 'is-active' : null],
      'aria-pressed': view === 'map' ? 'true' : 'false',
      onClick: () => {
        view = 'map';
        syncUrl();
        renderAll();
      }
    }, icon('map', 16), 'Map');

    return fragment(
      el('div', { class: 'search__bar' },
        el('div', { class: 'search__bar-input' }, icon('search', 18), queryInput),
        el('div', { class: 'search__bar-controls' },
          el('label', { class: 'inline-field' }, el('span', null, 'Sort'), sortSelect),
          el('div', { class: 'segmented', role: 'group', 'aria-label': 'Results view' }, listButton, mapButton),
          el('button', { type: 'button', class: 'button button--ghost', onClick: resetAll }, 'Reset all')
        )
      ),
      el('div', { class: 'search__panels' },
        cityCheckboxes(),
        propertyControls(),
        rentControls(),
        statusCheckboxes()
      )
    );
  }

  function buildChips(result) {
    const chips = activeChips(filters, (inr) => formatMoney(displayBudget(inr, filters.displayCurrency), filters.displayCurrency));
    if (chips.length === 0) {
      return el('p', { class: 'chips__empty' }, 'No filters applied — showing every sample home.');
    }
    return fragment(
      el('ul', { class: 'chips', 'aria-label': 'Active filters' }, ...chips.map((chip) =>
        el('li', null,
          el('button', {
            type: 'button',
            class: 'chip chip--removable',
            onClick: () => {
              if (Array.isArray(filters[chip.key])) {
                update({ ...filters, [chip.key]: filters[chip.key].filter((value) => value !== chip.value) });
              } else if (chip.key === 'q') {
                update({ ...filters, q: '' });
              } else {
                update({ ...filters, [chip.key]: null });
              }
            }
          }, chip.label, icon('close', 13))
        ))),
      el('button', { type: 'button', class: 'button button--quiet', onClick: resetAll }, 'Reset all'),
      el('p', { class: 'chips__count' }, `${formatNumber(result.matched)} home${result.matched === 1 ? '' : 's'} match${result.matched === 1 ? 'es' : ''} these filters.`)
    );
  }

  /* --- map ---------------------------------------------------------------- */

  /**
   * A real map, with a real credit, and nothing plotted on it.
   *
   * The pin layer is deliberately empty rather than filled with invented
   * positions: no record here has a checked location, and a plausible-looking dot
   * on a real street would be a claim about the world that this dataset cannot
   * support. The explanation is part of the component, not a footnote.
   */
  function buildMap(results) {
    const cityIds = filters.cities || [];
    const single = cityIds.length === 1 ? cityIds[0] : null;
    const centre = single ? cityCentre(single) : null;
    const city = single ? CITIES.find((entry) => entry.id === single) : null;
    const canDraw = Boolean(mapTiles?.enabled && centre);

    const canvas = el('div', { class: 'map-frame__canvas' });
    const warningSlot = el('div');
    const credit = el('p', { class: 'map-frame__credit' },
      'Map data ',
      el('a', { href: mapTiles?.attributionUrl || OSM_ATTRIBUTION_URL, target: '_blank', rel: 'noopener' }, mapTiles?.attribution || OSM_ATTRIBUTION),
      single ? ` · City centre from a static table dated ${CITY_CENTRES_DATED}.` : ''
    );

    if (canDraw) {
      // Built after the element is in the document, so Leaflet can measure it.
      window.requestAnimationFrame(() => {
        createRentalMap(canvas, {
          center: centre,
          zoom: CITY_ZOOM,
          marker: null,
          tiles: mapTiles,
          onTilesUnavailable: () => {
            if (warningSlot.isConnected && !warningSlot.firstChild) {
              warningSlot.append(offlineNote(tileHostOf(mapTiles.tileUrl)));
            }
          }
        }).then((map) => {
          if (map || !canvas.isConnected) return;
          warningSlot.append(offlineNote(tileHostOf(mapTiles.tileUrl)));
        });
      });
    }

    const panel = el('div', { class: 'map-frame' },
      canDraw
        ? el('div', { class: 'map-frame__body' },
            canvas,
            el('div', { class: 'map-frame__foot' },
              el('h2', { class: 'map-frame__title' }, `Map of ${city?.name || single} · nothing plotted`),
              el('p', null, 'This is a real map of the city centre. No home in this dataset carries a checked location, so no home is plotted on it — the pin layer is empty on purpose, not by accident.'),
              el('p', { class: 'map-frame__small' }, CITY_CENTRE_DISCLOSURE),
              credit
            )
          )
        : el('div', { class: 'map-placeholder' },
            el('div', { class: 'map-placeholder__note', id: 'map-disclaimer' },
              el('p', { class: 'map-placeholder__title' }, mapTiles && !mapTiles.enabled
                ? (mapTiles.unreachable ? 'The map configuration could not be confirmed' : 'Map tiles are switched off on this server')
                : 'Choose one city to see a map'),
              el('p', null, mapTiles && !mapTiles.enabled
                ? (mapTiles.unreachable
                  ? 'Without a confirmed tile provider and credit, no map is drawn and no remote request is made. Nothing else on this page is affected.'
                  : 'The server is running without a tile provider, so no map is drawn and no remote request is made. Every number on this page is unaffected.')
                : 'Demo records carry no coordinates and no verified address, and this prototype never invents them. Pick a single city in the filters to see a real map of its centre — still with nothing plotted on it.'),
              el('p', null, 'Maps apply only to real listing addresses, and FORKSPACE never scrapes a map service.')
            )
          ),
      warningSlot,
      el('p', { class: 'footnote' }, results.length > 0
        ? `${pluralise(results.length, 'home')} in this result set. None of them carries a checked location, so none is plotted.`
        : 'No homes match the current filters.')
    );

    return panel;
  }

  /* --- states ------------------------------------------------------------ */

  function buildSkeleton() {
    return el('div', { class: 'results-grid', 'aria-busy': 'true', 'aria-live': 'polite' },
      ...Array.from({ length: 6 }, () => el('div', { class: 'card card--skeleton' },
        el('div', { class: 'skeleton skeleton--media' }),
        el('div', { class: 'card__body' },
          el('div', { class: 'skeleton skeleton--line' }),
          el('div', { class: 'skeleton skeleton--line skeleton--short' }),
          el('div', { class: 'skeleton skeleton--block' })
        )
      ))
    );
  }

  function buildEmptyState() {
    return el('div', { class: 'state' },
      el('h2', { class: 'state__title' }, 'Start with a destination, or read a home end to end'),
      el('p', { class: 'state__text' }, 'Nothing is filtered yet. Pick a city below, or open the research assistant and describe what you are looking for.'),
      el('div', { class: 'state__suggestions' },
        ...CITIES.slice(0, 6).map((city) => el('button', {
          type: 'button',
          class: 'chip',
          onClick: () => update({ ...DEFAULT_FILTERS, cities: [city.id], displayCurrency: filters.displayCurrency })
        }, city.name))
      ),
      el('div', { class: 'cta-row' },
        el('a', { class: 'button button--ghost', href: '#/research' }, 'Open the research assistant'),
        el('a', { class: 'button button--quiet', href: '#/sources' }, 'Where the data comes from')
      )
    );
  }

  function buildNoResults(result) {
    const suggestions = [];
    if (filters.cities.length) suggestions.push({ label: 'Remove the city filter', action: () => setFilter('cities', []) });
    if (filters.rentMaxInr) suggestions.push({ label: 'Remove the maximum rent', action: () => setFilter('rentMaxInr', null) });
    if (filters.rentMinInr) suggestions.push({ label: 'Remove the minimum rent', action: () => setFilter('rentMinInr', null) });
    if (filters.bedroomsMin) suggestions.push({ label: 'Allow any bedroom count', action: () => setFilter('bedroomsMin', null) });
    if (filters.types.length) suggestions.push({ label: 'Allow any property type', action: () => setFilter('types', []) });
    if (filters.furnishing.length) suggestions.push({ label: 'Allow any furnishing', action: () => setFilter('furnishing', []) });
    if (filters.amenities.length) suggestions.push({ label: 'Drop the amenity filters', action: () => setFilter('amenities', []) });
    if (filters.statuses.length) suggestions.push({ label: 'Show every listing status', action: () => setFilter('statuses', []) });
    if (filters.leaseMonthsMin) suggestions.push({ label: 'Allow any lease length', action: () => setFilter('leaseMonthsMin', null) });
    if (filters.q) suggestions.push({ label: `Clear the search “${filters.q}”`, action: () => setFilter('q', '') });

    return el('div', { class: 'state' },
      el('h2', { class: 'state__title' }, 'No sample home matches these filters'),
      el('p', { class: 'state__text' }, 'This prototype holds 13 invented homes, so an empty result is easy to reach. Loosen one filter at a time, or start again.'),
      suggestions.length
        ? el('div', { class: 'state__suggestions' }, ...suggestions.map((suggestion) =>
            el('button', { type: 'button', class: 'chip', onClick: suggestion.action }, suggestion.label)))
        : null,
      el('div', { class: 'cta-row' },
        el('button', { type: 'button', class: 'button button--primary', onClick: resetAll }, 'Reset all filters'),
        el('a', { class: 'button button--ghost', href: '#/research' }, 'Try the research assistant')
      ),
      result.excludedByBudget.length
        ? el('div', { class: 'excluded-note' },
            el('h3', { class: 'excluded-note__title' }, 'Excluded by the budget filter, with reasons'),
            el('ul', null, ...result.excludedByBudget.map((entry) =>
              el('li', null, el('strong', null, `${entry.listing.title} (${entry.listing.city})`), ` — ${entry.reason}`))))
        : null
    );
  }

  /* --- results ------------------------------------------------------------ */

  function buildResults() {
    const state = loadState();
    const pool = data.listings?.length ? data.listings : LISTINGS;
    const filtered = filterListings(pool, filters);
    const results = sort === 'relevance'
      ? sortByRelevance(filtered.results, filters.q)
      : sortListings(filtered.results, sort);

    if (view === 'map') {
      ensureMapConfig();
      const map = buildMap(results);
      const list = el('div', { class: 'results-grid' }, ...results.map((listing) => listingCard(listing, {
        displayCurrency: filters.displayCurrency === 'INR' ? null : filters.displayCurrency,
        compareCount: state.compared.length,
        onStoreChange: handleStoreChange
      })));
      return fragment(el('p', { class: 'results__count' }, `${pluralise(results.length, 'home')} · map view`), map, el('h2', { class: 'section__subtitle' }, 'The same homes, as a list'), list);
    }

    const anyFilter = activeChips(filters).length > 0;
    if (results.length === 0 && !anyFilter) return buildEmptyState();
    if (results.length === 0) return buildNoResults(filtered);

    return fragment(
      el('p', { class: 'results__count' }, `${pluralise(results.length, 'home')} · sorted by ${SORTS.find((option) => option.id === sort)?.label?.toLowerCase() || 'relevance'}`),
      el('div', { class: 'results-grid' }, ...results.map((listing) => listingCard(listing, {
        displayCurrency: filters.displayCurrency === 'INR' ? null : filters.displayCurrency,
        compareCount: state.compared.length,
        onStoreChange: handleStoreChange
      }))),
      filtered.excludedByBudget.length
        ? el('details', { class: 'excluded-note' },
            el('summary', null, `${filtered.excludedByBudget.length} home${filtered.excludedByBudget.length === 1 ? '' : 's'} excluded by the budget filter`),
            el('ul', null, ...filtered.excludedByBudget.map((entry) =>
              el('li', null, el('strong', null, `${entry.listing.title} (${entry.listing.city})`), ` — ${entry.reason}`)))
          )
        : null
    );
  }

  /** Refresh the bar in place: a card toggle must show its effect immediately. */
  function handleStoreChange(result) {
    onStoreChange?.(result);
    compareSlot.replaceChildren(buildCompareBar());
  }

  function buildCompareBar() {
    const state = loadState();
    const selected = state.compared;
    const canCompare = selected.length >= 2;
    return el('div', { class: 'compare-bar', role: 'region', 'aria-label': 'Comparison selection' },
      el('div', { class: 'compare-bar__info' },
        el('p', { class: 'compare-bar__title' }, selected.length === 0
          ? `Select 2 to ${COMPARE_MAX} homes to compare`
          : `${selected.length} of ${COMPARE_MAX} selected`),
        el('p', { class: 'compare-bar__note' }, canCompare
          ? 'Comparison opens as a side-by-side table.'
          : 'Comparison needs at least two homes.')
      ),
      el('div', { class: 'compare-bar__actions' },
        selected.length ? el('button', { type: 'button', class: 'button button--quiet', onClick: () => { clearCompared(); handleStoreChange(); } }, 'Clear selection') : null,
        canCompare
          ? el('a', { class: 'button button--primary', href: `#/compare?ids=${selected.join(',')}` }, icon('columns', 16), `Compare ${selected.length} homes`)
          : el('span', { class: 'button button--primary is-disabled', 'aria-disabled': 'true' }, icon('columns', 16), 'Compare homes')
      )
    );
  }

  function renderAll() {
    replace(controlsSlot, buildControls());
    const pool = data.listings?.length ? data.listings : LISTINGS;
    const filtered = filterListings(pool, filters);
    replace(chipsSlot, buildChips(filtered));
    replace(resultsSlot, loading ? buildSkeleton() : buildResults());
    replace(compareSlot, buildCompareBar());
  }

  root.append(
    el('header', { class: 'page-head' },
      el('p', { class: 'page-head__eyebrow' }, 'Search'),
      el('h1', { class: 'page-head__title' }, 'Sample homes worldwide'),
      el('p', { class: 'page-head__lede' }, 'Thirteen invented homes across twelve cities, each with its known costs, its estimates and its gaps shown separately. Filters update the results immediately.')
    ),
    controlsSlot,
    chipsSlot,
    resultsSlot,
    compareSlot
  );

  renderAll();
  // A brief loading state so a slow dataset never flashes an empty page.
  const timer = window.setTimeout(() => {
    loading = false;
    renderAll();
  }, 140);
  on(window, 'beforeunload', () => window.clearTimeout(timer), { once: true });

  return root;
}
