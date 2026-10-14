/**
 * Property details.
 *
 * The page is built around one rule: a reader must be able to tell, at a
 * glance, what is known, what is estimated and what nobody has said. Money
 * rows carry their kind, unknown fees are listed but never totalised, the
 * provenance block is always present, and every gallery carries the
 * "illustrative photos" caption.
 */
import { el, fragment, on, replace } from '../lib/dom.js';
import { icon } from '../components/icons.js';
import { kindTag, sampleBadge, statusBadge, freshnessBadge, photoImage, photoCredit, disclosureNote, amenityList, verificationRow } from '../components/cards.js';
import { LISTINGS } from '../data/listings.js';
import { PHOTOS, PHOTO_DISCLOSURE, photoById, photosForListing, creditLine } from '../data/photos.js';
import { buildCostBreakdown } from '../lib/costs.js';
import { formatMoney, formatNumber, formatDate, pluralise, UNKNOWN_TEXT } from '../data/format.js';
import { allQuestions } from '../data/questions.js';
import { isChecked, setChecked, isSaved, toggleSaved, isCompared, toggleCompared, COMPARE_MAX, loadState } from '../lib/store.js';
import { benchmarkById } from '../data/benchmarks.js';
import { freshnessOf } from '../lib/freshness.js';
import { STATUS_LABELS } from '../data/schema.js';
import { api } from '../lib/api.js';
import { createRentalMap, locationOf, locationSourceLine, offlineNote, tileConfig, tileHostOf, OSM_ATTRIBUTION, OSM_ATTRIBUTION_URL } from '../lib/map.js';

function specRow(label, value) {
  return el('div', { class: 'spec' },
    el('dt', { class: 'spec__label' }, label),
    el('dd', { class: 'spec__value' }, value ?? UNKNOWN_TEXT)
  );
}

function moneyTable(breakdown, format) {
  const rows = [];
  const pushRows = (bucket, title, subtitle) => {
    if (bucket.known.length === 0 && bucket.estimates.length === 0 && bucket.unknown.length === 0) return;
    rows.push(el('tr', { class: 'cost-table__group' }, el('th', { colspan: '3', scope: 'colgroup' },
      el('span', { class: 'cost-table__group-title' }, title),
      el('span', { class: 'cost-table__group-note' }, subtitle))));
    const ordered = [...bucket.known, ...bucket.estimates, ...bucket.unknown];
    for (const row of ordered) {
      rows.push(el('tr', { class: `cost-table__row cost-table__row--${row.kind}` },
        el('th', { scope: 'row' },
          el('span', { class: 'cost-table__label' }, row.label),
          row.note ? el('span', { class: 'cost-table__note' }, row.note) : null
        ),
        el('td', { class: 'cost-table__amount' }, row.kind === 'unknown'
          ? el('span', { class: 'cost-table__unknown' }, 'Amount not stated')
          : format(row.amount, row.currency)),
        el('td', { class: 'cost-table__kind' }, kindTag(row.kind))
      ));
    }
  };

  pushRows(breakdown.upfront, 'Upfront / one-off', 'Deposits, holding fees and anything paid once.');
  pushRows(breakdown.monthly, 'Recurring monthly', 'Rent and every monthly cost the record mentions.');
  if (breakdown.annual.known.length || breakdown.annual.estimates.length || breakdown.annual.unknown.length) {
    pushRows(breakdown.annual, 'Recurring annually', 'Billed yearly rather than monthly.');
  }

  const totalRow = (label, bucket, { includeEstimates }) => {
    const hasAnything = bucket.known.length || bucket.estimates.length || bucket.unknown.length;
    if (!hasAnything) return null;
    const knownTotal = bucket.knownTotal;
    const estimateTotal = includeEstimates ? bucket.estimateTotal : 0;
    const total = knownTotal + estimateTotal;
    return el('tr', { class: 'cost-table__total' },
      el('th', { scope: 'row' }, label),
      el('td', { class: 'cost-table__amount' }, format(total, breakdown.currency)),
      el('td', { class: 'cost-table__kind' },
        estimateTotal > 0 ? el('span', { class: 'cost-table__mixed' }, 'known + estimates') : el('span', { class: 'tag tag--known' }, 'known only'))
    );
  };

  const table = el('table', { class: 'cost-table' },
    el('caption', { class: 'cost-table__caption' },
      'Every amount is labelled known, estimate or unknown. Unknown amounts are never added to a total.'),
    el('thead', null,
      el('tr', null,
        el('th', { scope: 'col' }, 'Cost'),
        el('th', { scope: 'col' }, 'Amount'),
        el('th', { scope: 'col' }, 'Basis')
      )
    ),
    el('tbody', null,
      ...rows,
      totalRow('Upfront total, known amounts only', breakdown.upfront, { includeEstimates: false }),
      totalRow('Upfront total including marked estimates', breakdown.upfront, { includeEstimates: true }),
      totalRow('Monthly total, known amounts only', breakdown.monthly, { includeEstimates: false }),
      totalRow('Monthly total including marked estimates', breakdown.monthly, { includeEstimates: true })
    )
  );
  return table;
}

/**
 * Where the home is.
 *
 * Two honest outcomes, and no third one. If the record carries checked
 * coordinates, a real OpenStreetMap map is drawn with its credit and the source of
 * the coordinates. If it does not — as with every record in this dataset — the
 * panel says why there is no map instead of drawing an empty one or, worse, a
 * plausible-looking dot. A fictional home is never plotted on a real street.
 */
function locationBlock(listing) {
  const location = locationOf(listing);
  const shell = el('div', { class: 'map-frame__shell' });

  if (!location) {
    return el('section', { class: 'panel' },
      el('h2', { class: 'panel__title' }, 'Where it is'),
      el('p', { class: 'panel__text' }, listing.area || listing.city
        ? `Neighbourhood: ${listing.area}, ${listing.city}. Street-level coordinates are not part of this record, so there is no map to show.`
        : 'This record has no neighbourhood or coordinates recorded.'),
      el('ul', { class: 'bullet-list' },
        el('li', null, 'The demo records here carry invented addresses. A pin on a real map would be a claim about the world that this dataset cannot support, so none is drawn.'),
        el('li', null, 'Coordinates arrive with licensed or authorised listing data, and the schema refuses to accept them without a source and a date.'),
        el('li', null, 'No map service is ever scraped, and no location is ever estimated from a postcode or a neighbourhood name.')
      ),
      el('p', { class: 'footnote' }, 'Commute and walkability figures on this page are illustrative estimates computed from the record itself, never from a map provider.')
    );
  }

  const credit = el('p', { class: 'map-frame__credit' },
    'Map data ',
    el('a', { href: OSM_ATTRIBUTION_URL, target: '_blank', rel: 'noopener' }, OSM_ATTRIBUTION)
  );

  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Where it is'),
    el('p', { class: 'panel__text' }, `${listing.area}, ${listing.city}. ${locationSourceLine(location)}`),
    shell,
    location.note ? el('p', { class: 'footnote' }, location.note) : null,
    el('p', { class: 'footnote' }, 'The pin marks the home\'s own coordinates. Nearby properties are never listed here, because this prototype holds no other records for this address.'),
    credit
  );
}

/**
 * Built after the panel is in the document, so Leaflet can measure the element,
 * and only once the server has confirmed where tiles come from and what credit
 * they carry. Without both, no map and no remote request.
 */
function mountLocationMap(shell, listing) {
  const location = locationOf(listing);
  if (!location || !shell.isConnected) return;
  const canvas = el('div', { class: 'map-frame__canvas' });
  shell.append(canvas);
  tileConfig().then((tiles) => {
    if (!canvas.isConnected) return;
    if (!tiles?.enabled) {
      canvas.append(el('p', { class: 'map-frame__warning', role: 'status' },
        tiles?.unreachable
          ? 'The tile provider could not be confirmed with the server, so no map is drawn and no remote request is made. The coordinates above are still shown.'
          : 'Map tiles are switched off on this server, so the coordinates are shown as text instead of a map.'));
      return;
    }
    const warn = () => {
      if (canvas.isConnected && !shell.querySelector('.map-frame__warning')) {
        shell.append(offlineNote(tileHostOf(tiles.tileUrl)));
      }
    };
    return createRentalMap(canvas, {
      center: location,
      zoom: 16,
      marker: { lat: location.lat, lng: location.lng, label: listing.title },
      tiles,
      onTilesUnavailable: warn
    }).then((map) => {
      if (map || !canvas.isConnected) return;
      warn();
    });
  });
}

function benchmarkBlock(listing) {
  if (!listing.benchmark) return null;
  const benchmark = benchmarkById(listing.benchmark);
  if (!benchmark) return null;
  if (!benchmark.available || !benchmark.figures) {
    return el('section', { class: 'panel panel--benchmark' },
      el('h2', { class: 'panel__title' }, benchmark.label),
      el('p', { class: 'panel__text' }, 'The official statistics file has not been loaded in this deployment, so no benchmark figure is shown rather than a figure of unknown provenance.'),
      el('p', { class: 'footnote' }, `${benchmark.publisher} · ${benchmark.series} · ${benchmark.licence}`)
    );
  }
  const format = (value) => formatMoney(value, benchmark.currency, benchmark.locale);
  return el('section', { class: 'panel panel--benchmark' },
    el('div', { class: 'panel__head' },
      el('h2', { class: 'panel__title' }, benchmark.label),
      el('span', { class: 'tag tag--official' }, 'Official statistics')
    ),
    el('dl', { class: 'benchmark-figures' },
      el('div', null, el('dt', null, 'London average monthly rent'), el('dd', null, format(benchmark.figures.londonAverageMonthlyRent))),
      el('div', null, el('dt', null, 'United Kingdom average'), el('dd', null, format(benchmark.figures.ukAverageMonthlyRent))),
      el('div', null, el('dt', null, 'England average'), el('dd', null, format(benchmark.figures.englandAverageMonthlyRent)))
    ),
    el('p', { class: 'benchmark-caveat' }, 'This is an area average for the whole private rented stock, not a price for this home. It has no bedroom split and no property-type split, so it is not comparable with a specific flat.'),
    el('ul', { class: 'caveat-list' }, ...benchmark.caveats.map((caveat) => el('li', null, caveat))),
    el('p', { class: 'footnote' },
      `${benchmark.publisher} · ${benchmark.series} · reference period ${benchmark.referencePeriod} · released ${benchmark.releasedAt} · ${benchmark.licence}. `,
      benchmark.sourceUrl ? el('a', { href: benchmark.sourceUrl, rel: 'noopener noreferrer nofollow', target: '_blank' }, 'Source bulletin') : null
    )
  );
}

function sourceBlock(listing) {
  const { source, provenance, verification, status } = listing;
  const rows = [
    ['Source', source.name],
    ['Source type', source.kind],
    ['Attribution', source.attribution],
    ['Licence', source.licence],
    ['Terms', source.termsUrl ? el('a', { href: source.termsUrl, rel: 'noopener noreferrer nofollow', target: '_blank' }, source.termsUrl) : 'No terms URL recorded'],
    ['Last verified', verification.lastVerifiedAt ? `${formatDate(verification.lastVerifiedAt)} · method: ${verification.method}` : 'Never verified — no verification timestamp exists for this record'],
    ['Listing status', STATUS_LABELS[status] || status],
    ['Provider record id', provenance.providerRecordId || 'Not supplied'],
    ['Fetched at', provenance.fetchedAt ? formatDate(provenance.fetchedAt) : 'Not supplied'],
    ['Raw hash', provenance.rawHash || 'Not supplied'],
    ['Schema version', provenance.schemaVersion],
    ['Demo record', provenance.isDemo ? 'Yes — fictional, written for this prototype' : 'No']
  ];
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Data provenance'),
    el('dl', { class: 'provenance' }, ...rows.map(([label, value]) =>
      el('div', { class: 'provenance__row' },
        el('dt', { class: 'provenance__label' }, label),
        el('dd', { class: 'provenance__value' }, value)
      )))
  );
}

function originalSourceBlock(listing) {
  if (listing.source.url) {
    return el('section', { class: 'panel' },
      el('h2', { class: 'panel__title' }, 'Original listing'),
      el('p', { class: 'panel__text' },
        'This record came from an external source. Open it to confirm details before you rely on anything here.',
        ' ',
        el('a', { class: 'inline-link', href: listing.source.url, rel: 'noopener noreferrer nofollow', target: '_blank' }, 'Open the original listing', icon('external', 15))
      ),
      el('p', { class: 'footnote' }, 'FORKSPACE links out; it never copies a listing site wholesale and never scrapes one.')
    );
  }
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Original listing'),
    el('p', { class: 'panel__text' },
      listing.provenance.isDemo
        ? `There is no original listing to link to. This home is a fictional record written for the prototype, so no source URL exists and none is invented.`
        : `The source did not provide a public URL for this record. A record without a source URL cannot be checked by anyone else, which is why it is flagged here.`
    )
  );
}

function gallery(listing) {
  const photos = photosForListing(listing);
  if (photos.length === 0) {
    return el('section', { class: 'gallery gallery--empty' },
      el('p', { class: 'gallery__caption' }, 'No photographs have been cleared for this home.'),
      disclosureNote()
    );
  }
  let index = 0;
  const mainSlot = el('div', { class: 'gallery__main' });
  const counter = el('p', { class: 'gallery__counter', 'aria-live': 'polite' });
  const creditSlot = el('p', { class: 'gallery__credit' });
  const thumbs = el('div', { class: 'gallery__thumbs', role: 'tablist', 'aria-label': 'Photographs' });

  function render() {
    const photo = photos[index];
    replace(mainSlot, 
      photoImage(photo, { sizes: '(max-width: 900px) 100vw, 640px', className: 'gallery__image' })
    );
    counter.textContent = `Photo ${index + 1} of ${photos.length}`;
    replace(creditSlot, photoCredit(photo), el('span', { class: 'gallery__depicts' }, ` Depicts: ${photo.depicts}`));
    replace(thumbs, ...photos.map((item, itemIndex) =>
      el('button', {
        type: 'button',
        class: ['gallery__thumb', itemIndex === index ? 'is-active' : null],
        role: 'tab',
        'aria-selected': itemIndex === index ? 'true' : 'false',
        'aria-label': `Show photograph ${itemIndex + 1} of ${photos.length}`,
        onClick: () => {
          index = itemIndex;
          render();
        }
      }, photoImage(item, { sizes: '120px', className: 'gallery__thumb-image' }))
    ));
  }

  const container = el('section', {
    class: 'gallery',
    tabindex: '0',
    role: 'group',
    'aria-label': `Photographs of ${listing.city}. Use the left and right arrow keys to move between them.`,
    onKeydown: (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        index = event.key === 'ArrowRight' ? (index + 1) % photos.length : (index - 1 + photos.length) % photos.length;
        render();
      }
    }
  },
    el('div', { class: 'gallery__stage' },
      mainSlot,
      el('div', { class: 'gallery__controls' },
        el('button', { type: 'button', class: 'icon-button', 'aria-label': 'Previous photograph', onClick: () => { index = (index - 1 + photos.length) % photos.length; render(); } }, icon('arrowLeft')),
        counter,
        el('button', { type: 'button', class: 'icon-button', 'aria-label': 'Next photograph', onClick: () => { index = (index + 1) % photos.length; render(); } }, icon('arrowRight'))
      )
    ),
    thumbs,
    creditSlot,
    el('p', { class: 'gallery__disclosure' }, PHOTO_DISCLOSURE),
    el('p', { class: 'gallery__hint' }, 'Tip: focus the gallery and use the arrow keys. Photographs show the city or an interior, never this exact home.')
  );

  render();
  return container;
}

function questionChecklist(listing, { onStoreChange }) {
  const questions = allQuestions(listing);
  const list = el('ul', { class: 'checklist' });
  for (const question of questions) {
    const input = el('input', {
      type: 'checkbox',
      id: `q-${listing.id}-${question.id}`,
      checked: isChecked(listing.id, question.id),
      onChange: (event) => {
        setChecked(listing.id, question.id, event.target.checked);
        onStoreChange?.();
      }
    });
    list.append(el('li', { class: 'checklist__item' },
      el('label', { class: 'checklist__label', for: input.id ?? undefined },
        el('span', { class: 'checklist__control' }, input),
        el('span', { class: 'checklist__text' }, question.text))
    ));
  }
  const count = el('p', { class: 'checklist__count' });
  const updateCount = () => {
    const state = loadState();
    const ticked = Object.keys(state.questions?.[listing.id] || {}).length;
    count.textContent = `${ticked} of ${questions.length} ticked. Ticks are stored on this device only.`;
  };
  updateCount();
  on(list, 'change', updateCount);
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Questions to ask before committing'),
    el('p', { class: 'panel__text' }, 'A starting script for the viewing or the call. Nothing here is legal advice, and none of it is sent to a server.'),
    list,
    count
  );
}

function listBlock(title, items, className) {
  if (!items?.length) return null;
  return el('section', { class: `panel ${className}` },
    el('h2', { class: 'panel__title' }, title),
    el('ul', { class: 'bullet-list' }, ...items.map((item) => el('li', null, item)))
  );
}

export function renderProperty({ route, navigate, data, onStoreChange, notify }) {
  const pool = data.listings?.length ? data.listings : LISTINGS;
  const listing = pool.find((item) => item.id === route.id);

  if (!listing) {
    return el('div', { class: 'state' },
      el('h1', { class: 'state__title' }, 'That home is not in this dataset'),
      el('p', { class: 'state__text' }, `No demo record has the id “${route.id}”. The sample dataset holds ${pool.length} homes.`),
      el('div', { class: 'cta-row' },
        el('a', { class: 'button button--primary', href: '#/search' }, 'Back to search'),
        el('a', { class: 'button button--ghost', href: '#/' }, 'Homepage')
      )
    );
  }

  const breakdown = buildCostBreakdown(listing);
  const format = (amount, currency = breakdown.currency) => formatMoney(amount, currency, listing.rent.locale);
  const state = loadState();
  const saved = isSaved(listing.id);
  const compared = isCompared(listing.id);
  const now = Date.now();

  const saveButton = el('button', {
    type: 'button',
    class: ['button', saved ? 'button--saved' : 'button--ghost'],
    'aria-pressed': saved ? 'true' : 'false',
    onClick: () => {
      toggleSaved(listing.id);
      onStoreChange?.();
      render();
    }
  }, icon('heart'), saved ? 'Saved' : 'Save to favourites');

  const compareButton = el('button', {
    type: 'button',
    class: ['button', compared ? 'button--saved' : 'button--ghost'],
    'aria-pressed': compared ? 'true' : 'false',
    onClick: () => {
      const result = toggleCompared(listing.id);
      if (!result.ok) notify?.(result.reason, 'warn');
      onStoreChange?.();
      render();
    }
  }, icon('columns', 16), compared ? 'In comparison' : 'Add to comparison');

  const page = el('article', { class: 'property' });
  function render() {
    const currentSaved = isSaved(listing.id);
    replace(saveButton, icon('heart'), currentSaved ? 'Saved' : 'Save to favourites');
    saveButton.setAttribute('aria-pressed', currentSaved ? 'true' : 'false');
    saveButton.classList.toggle('button--saved', currentSaved);
    saveButton.classList.toggle('button--ghost', !currentSaved);
    const currentCompared = isCompared(listing.id);
    replace(compareButton, icon('columns', 16), currentCompared ? 'In comparison' : 'Add to comparison');
    compareButton.setAttribute('aria-pressed', currentCompared ? 'true' : 'false');
    compareButton.classList.toggle('button--saved', currentCompared);
    compareButton.classList.toggle('button--ghost', !currentCompared);
  }

  const freshness = freshnessOf(listing, now);

  page.append(
    el('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
      el('a', { href: '#/search' }, 'Search'),
      el('span', { 'aria-hidden': 'true' }, '/'),
      el('a', { href: `#/search?cities=${listing.cityId}` }, listing.city),
      el('span', { 'aria-hidden': 'true' }, '/'),
      el('span', null, listing.area)
    ),
    el('header', { class: 'property__head' },
      el('div', { class: 'property__head-main' },
        el('div', { class: 'property__badges' }, sampleBadge(listing, now), statusBadge(listing), freshnessBadge(listing, now), kindTag(listing.rent.kind, `Rent: ${listing.rent.kind}`)),
        el('h1', { class: 'property__title' }, listing.title),
        el('p', { class: 'property__location' }, icon('pin', 16), `${listing.area} · ${listing.city}, ${listing.country}`),
        el('p', { class: 'property__address' }, listing.address),
        verificationRow(listing, now)
      ),
      el('div', { class: 'property__actions' }, saveButton, compareButton,
        el('a', { class: 'button button--primary', href: `#/compare?ids=${[listing.id, ...loadState().compared.filter((id) => id !== listing.id)].slice(0, COMPARE_MAX).join(',')}` }, 'Compare now'))
    ),
    gallery(listing),
    el('div', { class: 'property__grid' },
      el('div', { class: 'property__main' },
        el('section', { class: 'panel' },
          el('h2', { class: 'panel__title' }, 'Rent and available cost'),
          el('div', { class: 'rent-panel' },
            el('div', { class: 'rent-panel__primary' },
              el('p', { class: 'rent-panel__amount' }, listing.rent.kind === 'unknown' ? UNKNOWN_TEXT : format(listing.rent.amount)),
              el('p', { class: 'rent-panel__meta' }, kindTag(listing.rent.kind), listing.rent.kind === 'unknown' ? 'No figure is stated, so none is shown or estimated.' : 'per month, in the listing’s own currency'),
              listing.rent.note ? el('p', { class: 'rent-panel__note' }, listing.rent.note) : null
            ),
            el('div', { class: 'rent-panel__totals' },
              el('div', { class: 'totals' },
                el('p', { class: 'totals__label' }, 'Upfront, known amounts'),
                el('p', { class: 'totals__value' }, format(breakdown.upfront.knownTotal)),
                el('p', { class: 'totals__note' }, breakdown.upfront.estimateTotal > 0
                  ? `Plus ${format(breakdown.upfront.estimateTotal)} in marked estimates.`
                  : 'No estimated upfront amounts.')
              ),
              el('div', { class: 'totals' },
                el('p', { class: 'totals__label' }, 'Monthly, known amounts'),
                el('p', { class: 'totals__value' }, format(breakdown.monthly.knownTotal)),
                el('p', { class: 'totals__note' }, breakdown.monthly.estimateTotal > 0
                  ? `Plus ${format(breakdown.monthly.estimateTotal)} in marked estimates.`
                  : 'No estimated monthly amounts.')
              ),
              el('div', { class: 'totals totals--unknown' },
                el('p', { class: 'totals__label' }, 'Unknown costs'),
                el('p', { class: 'totals__value' }, String(breakdown.upfront.unknownCount + breakdown.monthly.unknownCount + breakdown.annual.unknownCount)),
                el('p', { class: 'totals__note' }, 'Excluded from every total above, by design.')
              )
            )
          ),
          breakdown.caveats.length ? el('ul', { class: 'caveat-list' }, ...breakdown.caveats.map((caveat) => el('li', null, caveat))) : null
        ),
        el('section', { class: 'panel' },
          el('h2', { class: 'panel__title' }, 'Cost breakdown'),
          moneyTable(breakdown, format)
        ),
        el('section', { class: 'panel' },
          el('h2', { class: 'panel__title' }, 'Specs'),
          el('dl', { class: 'spec-grid' },
            specRow('Property type', listing.propertyType),
            specRow('Bedrooms', listing.bedrooms === null ? null : pluralise(listing.bedrooms, 'bed')),
            specRow('Bathrooms', listing.bathrooms === null ? null : formatNumber(listing.bathrooms)),
            specRow('Size', listing.sizeSqm ? `${formatNumber(listing.sizeSqm)} m²` : null),
            specRow('Floor', listing.floor ?? null),
            specRow('Furnishing', listing.furnishing === 'unknown' ? null : listing.furnishing),
            specRow('Minimum lease', listing.leaseMonths ? `${listing.leaseMonths} months` : (listing.leaseMonthsNote ? 'Not stated' : null)),
            specRow('Available from', listing.availableFrom ? formatDate(listing.availableFrom) : null)
          ),
          listing.furnishingNote ? el('p', { class: 'footnote' }, listing.furnishingNote) : null,
          listing.leaseMonthsNote ? el('p', { class: 'footnote' }, listing.leaseMonthsNote) : null
        ),
        el('section', { class: 'panel' },
          el('h2', { class: 'panel__title' }, 'Amenities'),
          el('p', { class: 'panel__text' }, 'Only amenities named in the listing are shown. A missing item here means the record is silent, not that the home lacks it.'),
          amenityList(listing),
          listing.amenitiesNote ? el('p', { class: 'footnote' }, listing.amenitiesNote) : null
        ),
        el('section', { class: 'panel' },
          el('h2', { class: 'panel__title' }, 'Neighbourhood and commute'),
          el('div', { class: 'commute-grid' },
            el('div', { class: 'commute' },
              el('h3', { class: 'commute__title' }, 'Commute'),
              listing.commute?.minutes !== null && listing.commute?.minutes !== undefined
                ? fragment(
                    el('p', { class: 'commute__value' }, `${formatNumber(listing.commute.minutes)} minutes`),
                    el('p', { class: 'commute__meta' }, `to ${listing.commute.hub} · ${kindTag('estimate')}`),
                    el('p', { class: 'commute__note' }, listing.commute.note || listing.commute.method)
                  )
                : el('p', { class: 'commute__value commute__value--none' }, 'Not available')
            ),
            el('div', { class: 'commute' },
              el('h3', { class: 'commute__title' }, 'Walkability'),
              listing.walkScore?.score !== null && listing.walkScore?.score !== undefined
                ? fragment(
                    el('p', { class: 'commute__value' }, `${listing.walkScore.score} / 100`),
                    el('p', { class: 'commute__meta' }, kindTag('estimate')),
                    el('p', { class: 'commute__note' }, listing.walkScore.note)
                  )
                : el('p', { class: 'commute__value commute__value--none' }, 'Not available')
            )
          ),
          el('div', { class: 'neighbourhood' },
            el('h3', { class: 'commute__title' }, listing.neighbourhood?.summary ? 'Neighbourhood' : 'Neighbourhood'),
            el('p', { class: 'panel__text' }, listing.neighbourhood?.summary || 'No neighbourhood description is recorded for this home.'),
            listing.neighbourhood?.tags?.length
              ? el('ul', { class: 'tag-list' }, ...listing.neighbourhood.tags.map((tag) => el('li', { class: 'tag tag--quiet' }, tag)))
              : null,
            listing.neighbourhood?.note ? el('p', { class: 'footnote' }, listing.neighbourhood.note) : null
          )
        ),
        locationBlock(listing),
        benchmarkBlock(listing),
        listBlock('What works well', listing.pros, 'panel--pros'),
        listBlock('Trade-offs', listing.tradeoffs, 'panel--cons'),
        listBlock('Missing information', listing.missing, 'panel--missing'),
        questionChecklist(listing, { onStoreChange }),
        originalSourceBlock(listing),
        sourceBlock(listing)
      ),
      el('aside', { class: 'property__aside' },
        el('section', { class: 'panel panel--sticky' },
          el('h2', { class: 'panel__title' }, 'At a glance'),
          el('dl', { class: 'glance' },
            el('div', null, el('dt', null, 'Monthly rent'), el('dd', null, listing.rent.kind === 'unknown' ? UNKNOWN_TEXT : `${format(listing.rent.amount)} ${listing.rent.kind === 'estimate' ? '(estimate)' : ''}`)),
            el('div', null, el('dt', null, 'Upfront, known'), el('dd', null, format(breakdown.upfront.knownTotal))),
            el('div', null, el('dt', null, 'Known monthly extras'), el('dd', null, format(breakdown.monthly.knownTotal - (listing.rent.kind === 'unknown' ? 0 : Number(listing.rent.amount))))),
            el('div', null, el('dt', null, 'Status'), el('dd', null, STATUS_LABELS[listing.status] || listing.status)),
            el('div', null, el('dt', null, 'Verified'), el('dd', null, listing.verification.lastVerifiedAt ? formatDate(listing.verification.lastVerifiedAt) : 'Never — sample record'))
          ),
          el('a', { class: 'button button--primary button--block', href: '#/research' }, 'Ask the research assistant about this kind of home'),
          el('p', { class: 'footnote' }, `Photographs: ${photosForListing(listing).length} cleared image${photosForListing(listing).length === 1 ? '' : 's'}. Caption applies everywhere: “${PHOTO_DISCLOSURE}”.`)
        ),
        el('section', { class: 'panel' },
          el('h2', { class: 'panel__title' }, 'Share this view'),
          el('p', { class: 'panel__text' }, 'Search filters and comparisons live in the URL, so a link reproduces what you see.'),
          el('p', { class: 'footnote' }, `Record id ${listing.id} · schema ${listing.provenance.schemaVersion}`)
        )
      )
    )
  );

  /**
   * The map is mounted after the page is returned, once it is in the document and
   * measurable. `requestAnimationFrame` would run before the router appends the
   * page, so the mount waits for that turn to finish.
   */
  window.setTimeout(() => {
    mountLocationMap(page.querySelector('.map-frame__shell') || el('div'), listing);
  }, 0);

  return page;
}
