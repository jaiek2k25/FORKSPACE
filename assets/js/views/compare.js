/**
 * Compare — two to four homes side by side.
 *
 * Rules that matter here:
 *   - A single home renders fine (one honest column plus a note), and so does an
 *     empty selection: the page must never break.
 *   - "Best value" is marked only where a value exists for at least two homes.
 *     An unknown never wins a comparison.
 *   - Amounts are shown in each home's own currency; converted figures used for
 *     the best-value markers are labelled as conversions from the static table.
 */
import { el, fragment, replace } from '../lib/dom.js';
import { icon } from '../components/icons.js';
import { kindTag, sampleBadge, statusBadge } from '../components/cards.js';
import { LISTINGS } from '../data/listings.js';
import { buildCostBreakdown, costSummary } from '../lib/costs.js';
import { formatMoney, formatNumber, pluralise, UNKNOWN_TEXT } from '../data/format.js';
import { convert, FX_RATES_AS_OF, toInr } from '../data/fx.js';
import { rentInInr } from '../lib/filters.js';
import { verificationLine } from '../lib/freshness.js';
import { removeFromCompare } from '../lib/compare-actions.js';
import { PHOTOS } from '../data/photos.js';
import { STATUS_LABELS } from '../data/schema.js';

const ROWS = [
  { id: 'rent', label: 'Monthly rent' },
  { id: 'upfront', label: 'Estimated upfront cost' },
  { id: 'recurring', label: 'Known recurring fees' },
  { id: 'unknowns', label: 'Unknown costs' },
  { id: 'beds', label: 'Beds and baths' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'commute', label: 'Commute estimate' },
  { id: 'neighbourhood', label: 'Neighbourhood' },
  { id: 'pros', label: 'Pros' },
  { id: 'cons', label: 'Cons' },
  { id: 'missing', label: 'Missing information' },
  { id: 'provenance', label: 'Source and verification' }
];

function bestOf(listings, getter, { mode = 'min' } = {}) {
  const values = listings
    .map((listing) => ({ id: listing.id, value: getter(listing) }))
    .filter((entry) => entry.value !== null && entry.value !== undefined && Number.isFinite(entry.value));
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => (mode === 'min' ? a.value - b.value : b.value - a.value));
  if (sorted[0].value === sorted[1].value) return null; // a tie is not a "best"
  return sorted[0].id;
}

function toggleFor(listing, best) {
  return best === listing.id ? el('span', { class: 'best-marker', title: 'Lowest/highest of the compared homes on this row' }, icon('check', 13), 'Best value') : null;
}

function cellContent(rowId, listing, context) {
  const { best } = context;
  switch (rowId) {
    case 'rent': {
      const { amount, currency, locale, kind } = listing.rent;
      if (kind === 'unknown' || amount === null) {
        return fragment(el('p', { class: 'compare__unknown' }, UNKNOWN_TEXT), kindTag('unknown'));
      }
      const inr = rentInInr(listing);
      return fragment(
        el('p', { class: 'compare__amount' }, formatMoney(amount, currency, locale), el('span', { class: 'compare__per' }, ' / month')),
        el('p', { class: 'compare__sub' }, kindTag(kind)),
        inr !== null && currency !== 'INR'
          ? el('p', { class: 'compare__converted' }, `≈ ${formatMoney(Math.round(convert(amount, currency, 'INR')), 'INR', 'en-IN')} converted for ranking (${FX_RATES_AS_OF})`)
          : null,
        toggleFor(listing, best.rent)
      );
    }
    case 'upfront': {
      const summary = costSummary(listing);
      if (summary.upfrontCombined === null) return el('p', { class: 'compare__unknown' }, 'No upfront amount stated');
      return fragment(
        el('p', { class: 'compare__amount' }, formatMoney(summary.upfrontKnown, summary.currency)),
        summary.upfrontEstimates > 0
          ? el('p', { class: 'compare__sub' }, `+ ${formatMoney(summary.upfrontEstimates, summary.currency)} in marked estimates`)
          : el('p', { class: 'compare__sub' }, 'known amounts only'),
        el('p', { class: 'compare__sub' }, summary.unknownUpfront > 0 ? `${summary.unknownUpfront} unknown cost${summary.unknownUpfront === 1 ? '' : 's'} excluded` : 'no unknown upfront costs'),
        toggleFor(listing, best.upfront)
      );
    }
    case 'recurring': {
      const breakdown = buildCostBreakdown(listing);
      const rows = breakdown.monthly.known.filter((row) => row.id !== 'rent');
      if (rows.length === 0) return el('p', { class: 'compare__unknown' }, 'None stated beyond the rent');
      return el('ul', { class: 'compare__list' }, ...rows.map((row) =>
        el('li', null, el('span', null, row.label), el('span', { class: 'compare__list-value' }, formatMoney(row.amount, row.currency)))) );
    }
    case 'unknowns': {
      const breakdown = buildCostBreakdown(listing);
      const unknownRows = [...breakdown.upfront.unknown, ...breakdown.monthly.unknown, ...breakdown.annual.unknown];
      if (unknownRows.length === 0) return el('p', { class: 'compare__ok' }, 'Every cost in this record is either known or estimated');
      return el('ul', { class: 'compare__list compare__list--unknown' }, ...unknownRows.map((row) =>
        el('li', null, el('span', null, row.label), el('span', { class: 'compare__list-value' }, 'not stated'))));
    }
    case 'beds': {
      const parts = [];
      if (listing.bedrooms === null) parts.push('Bedrooms not stated');
      else parts.push(pluralise(listing.bedrooms, 'bed'));
      parts.push(listing.bathrooms === null ? 'Bathrooms not stated' : `${formatNumber(listing.bathrooms)} bath`);
      if (listing.sizeSqm) parts.push(`${formatNumber(listing.sizeSqm)} m²`);
      if (listing.furnishing && listing.furnishing !== 'unknown') parts.push(listing.furnishing);
      return fragment(el('p', null, parts.join(' · ')), toggleFor(listing, best.beds));
    }
    case 'amenities':
      return listing.amenities?.length
        ? el('ul', { class: 'compare__tags' }, ...listing.amenities.map((amenity) => el('li', { class: 'tag tag--quiet' }, amenity)))
        : el('p', { class: 'compare__unknown' }, 'No amenities named in this record');
    case 'commute': {
      const minutes = listing.commute?.minutes;
      if (minutes === null || minutes === undefined) return el('p', { class: 'compare__unknown' }, 'Not available');
      return fragment(
        el('p', null, `${formatNumber(minutes)} min to ${listing.commute.hub}`),
        el('p', { class: 'compare__sub' }, kindTag('estimate'), ' ', listing.walkScore?.score ? `walk estimate ${listing.walkScore.score}/100` : 'no walkability estimate'),
        toggleFor(listing, best.commute)
      );
    }
    case 'neighbourhood':
      return fragment(
        el('p', null, listing.neighbourhood?.summary || 'No description recorded'),
        listing.neighbourhood?.tags?.length
          ? el('ul', { class: 'compare__tags' }, ...listing.neighbourhood.tags.map((tag) => el('li', { class: 'tag tag--quiet' }, tag)))
          : null
      );
    case 'pros':
      return listing.pros?.length
        ? el('ul', { class: 'compare__list compare__list--pos' }, ...listing.pros.map((item) => el('li', null, item)))
        : el('p', { class: 'compare__unknown' }, 'Nothing recorded');
    case 'cons':
      return listing.tradeoffs?.length
        ? el('ul', { class: 'compare__list compare__list--neg' }, ...listing.tradeoffs.map((item) => el('li', null, item)))
        : el('p', { class: 'compare__unknown' }, 'Nothing recorded');
    case 'missing':
      return listing.missing?.length
        ? el('ul', { class: 'compare__list compare__list--unknown' }, ...listing.missing.map((item) => el('li', null, item)))
        : el('p', { class: 'compare__ok' }, 'This record does not flag anything as missing');
    case 'provenance':
      return fragment(
        el('p', null, listing.source.name),
        el('p', { class: 'compare__sub' }, `Type: ${listing.source.kind}`),
        el('p', { class: 'compare__sub' }, verificationLine(listing)),
        el('p', { class: 'compare__sub' }, STATUS_LABELS[listing.status] || listing.status),
        sampleBadge(listing)
      );
    default:
      return null;
  }
}

/** A row is "the same" when every home's rendered text matches. */
function rowSignature(rowId, listings) {
  return listings.map((listing) => {
    const node = cellContent(rowId, listing, { best: {} });
    const text = node?.textContent?.trim() || '';
    return text;
  }).join('||');
}

export function renderCompare({ route, navigate, data, onStoreChange }) {
  const params = route.params;
  const requested = (params.get('ids') || '').split(',').map((value) => value.trim()).filter(Boolean).slice(0, 4);
  const pool = data.listings?.length ? data.listings : LISTINGS;
  const listings = requested.map((id) => pool.find((listing) => listing.id === id)).filter(Boolean);
  const missingIds = requested.filter((id) => !pool.some((listing) => listing.id === id));

  if (listings.length === 0) {
    return el('div', { class: 'state' },
      el('p', { class: 'page-head__eyebrow' }, 'Compare'),
      el('h1', { class: 'state__title' }, 'Nothing selected yet'),
      el('p', { class: 'state__text' }, 'Choose two to four homes in search or in your saved list, then press compare. A single home is fine too — you will just see one column until you add another.'),
      el('div', { class: 'cta-row' },
        el('a', { class: 'button button--primary', href: '#/search' }, 'Go to search'),
        el('a', { class: 'button button--ghost', href: '#/saved' }, 'Open saved homes')
      ),
      missingIds.length
        ? el('p', { class: 'footnote' }, `Ignored unknown id${missingIds.length === 1 ? '' : 's'}: ${missingIds.join(', ')}.`)
        : null
    );
  }

  let differencesOnly = params.get('diff') === '1';

  const rack = el('div', { class: 'compare__rack' });
  const tableSlot = el('div', {
    class: 'compare__table-slot',
    role: 'region',
    tabindex: '0',
    'aria-label': 'Side-by-side comparison table, scrollable'
  });

  const diffToggle = el('button', {
    type: 'button',
    class: ['segmented__button', differencesOnly ? 'is-active' : null],
    'aria-pressed': differencesOnly ? 'true' : 'false',
    onClick: () => {
      differencesOnly = !differencesOnly;
      const next = new URLSearchParams(params);
      if (differencesOnly) next.set('diff', '1');
      else next.delete('diff');
      window.history.replaceState(null, '', `#/compare?${next.toString()}`);
      diffToggle.setAttribute('aria-pressed', differencesOnly ? 'true' : 'false');
      diffToggle.classList.toggle('is-active', differencesOnly);
      renderTable();
    }
  }, 'Differences only');

  function renderRack() {
    replace(rack, ...listings.map((listing) => {
      const photo = listing.photos?.[0] ? PHOTOS[listing.photos[0]] : null;
      return el('article', { class: 'rack-card' },
        el('div', { class: 'rack-card__media' },
          photo
            ? el('img', { src: photo.src, alt: photo.alt, width: photo.width, height: photo.height, loading: 'lazy', decoding: 'async' })
            : el('div', { class: 'photo photo--empty', role: 'img', 'aria-label': 'No photograph available' }, el('p', { class: 'photo--empty__note' }, 'No cleared photo'))
        ),
        el('div', { class: 'rack-card__body' },
          el('div', { class: 'rack-card__badges' }, sampleBadge(listing), statusBadge(listing)),
          el('h2', { class: 'rack-card__title' }, el('a', { href: `#/property/${listing.id}` }, listing.title)),
          el('p', { class: 'rack-card__location' }, `${listing.area} · ${listing.city}`),
          el('button', {
            type: 'button',
            class: 'button button--quiet button--small',
            onClick: () => {
              removeFromCompare(listing.id);
              onStoreChange?.();
              navigate('compare', { ids: listings.filter((item) => item.id !== listing.id).map((item) => item.id) });
            }
          }, icon('close', 14), 'Remove')
        )
      );
    }));
  }

  function renderTable() {
    const best = {
      rent: bestOf(listings, (listing) => rentInInr(listing), { mode: 'min' }),
      upfront: bestOf(listings, (listing) => costSummary(listing).upfrontCombined, { mode: 'min' }),
      beds: bestOf(listings, (listing) => listing.bedrooms, { mode: 'max' }),
      commute: bestOf(listings, (listing) => (listing.commute?.minutes ?? null), { mode: 'min' })
    };
    const visibleRows = ROWS.filter((row) => {
      if (!differencesOnly || listings.length < 2) return true;
      return new Set(rowSignature(row.id, listings).split('||')).size > 1;
    });

    const table = el('table', { class: 'compare-table' },
      el('caption', { class: 'compare-table__caption' },
        `${listings.length} home${listings.length === 1 ? '' : 's'} compared. Unknown values never win a comparison and are never totalled.`),
      el('thead', null,
        el('tr', null,
          el('th', { scope: 'col' }, 'Row'),
          ...listings.map((listing) => el('th', { scope: 'col' }, listing.title, el('span', { class: 'compare-table__city' }, `${listing.area} · ${listing.city}`)))
        )
      ),
      el('tbody', null,
        ...visibleRows.map((row) => el('tr', null,
          el('th', { scope: 'row' }, row.label),
          ...listings.map((listing) => el('td', null, cellContent(row.id, listing, { best })))
        ))
      )
    );

    replace(tableSlot, 
      differencesOnly && listings.length < 2
        ? el('p', { class: 'footnote' }, 'Differences only needs at least two homes.')
        : null,
      differencesOnly && visibleRows.length < ROWS.length
        ? el('p', { class: 'footnote' }, `Hiding ${ROWS.length - visibleRows.length} row${ROWS.length - visibleRows.length === 1 ? '' : 's'} where every home is identical.`)
        : null,
      table
    );
  }

  const page = el('article', { class: 'compare' },
    el('header', { class: 'page-head' },
      el('p', { class: 'page-head__eyebrow' }, 'Compare'),
      el('h1', { class: 'page-head__title' }, listings.length === 1 ? 'One home selected' : `${listings.length} homes side by side`),
      el('p', { class: 'page-head__lede' }, listings.length === 1
        ? 'A single home renders fine here. Add one more from search or from your saved list to see a real side-by-side.'
        : 'Amounts stay in each home’s own currency. Best-value markers are the only place a converted figure is used, and the conversion is stated.'),
      el('div', { class: 'toolbar' },
        el('div', { class: 'segmented', role: 'group', 'aria-label': 'Comparison display' }, diffToggle),
        el('a', { class: 'button button--ghost', href: '#/search' }, 'Add another home')
      )
    ),
    rack,
    tableSlot,
    missingIds.length
      ? el('p', { class: 'footnote' }, `Ignored unknown id${missingIds.length === 1 ? '' : 's'}: ${missingIds.join(', ')}.`)
      : null,
    el('p', { class: 'footnote' }, `Best-value markers compare converted INR amounts from the illustrative static FX table dated ${FX_RATES_AS_OF}. They are a ranking aid, not a valuation.`)
  );

  renderRack();
  renderTable();
  return page;
}
