/**
 * Shared card and badge components.
 *
 * Money rules enforced here: the rent is formatted in the listing's own
 * currency and locale, carries its known/estimate/unknown label, and any
 * converted figure is explicitly labelled as a conversion from the static FX
 * table. Unknown amounts are never invented.
 */
import { el, on } from '../lib/dom.js';
import { icon } from './icons.js';
import { formatMoney, formatNumber, pluralise, UNKNOWN_TEXT } from '../data/format.js';
import { convert, fxNote, FX_RATES_AS_OF } from '../data/fx.js';
import { freshnessOf, verificationLine } from '../lib/freshness.js';
import { STATUS_LABELS } from '../data/schema.js';
import { PHOTO_DISCLOSURE, photoById } from '../data/photos.js';
import { isSaved, isCompared, toggleSaved, toggleCompared, COMPARE_MAX } from '../lib/store.js';

/* --- small pieces --------------------------------------------------------- */

export function kindTag(kind, label) {
  const text = label || (kind === 'known' ? 'Known' : kind === 'estimate' ? 'Estimate' : 'Unknown');
  return el('span', { class: ['tag', `tag--${kind}`], title: kind === 'unknown' ? 'Not stated in the listing' : `This figure is a ${kind}` }, text);
}

export function statusBadge(listing) {
  const status = listing.status || 'unknown';
  const label = STATUS_LABELS[status] || 'Status unknown';
  if (status === 'sample' || status === 'available') return null;
  return el('span', { class: ['badge', `badge--status-${status}`] }, label);
}

export function sampleBadge(listing, now = Date.now()) {
  if (!listing?.provenance?.isDemo && listing.status !== 'sample') return null;
  // The freshness of a sample record is already settled by the sample wording, so
  // the explanation that would otherwise sit in a separate "Sample" badge is kept
  // here rather than repeating the same word twice in a row.
  const freshness = freshnessOf(listing, now);
  return el('span', {
    class: 'badge badge--sample',
    title: `Fictional record written for this prototype. ${freshness.explanation}`
  }, 'Sample data · not verified');
}

export function freshnessBadge(listing, now = Date.now()) {
  // Redundant next to the sample badge: "Sample data · not verified" already says it.
  if (listing?.provenance?.isDemo || listing?.status === 'sample') return null;
  const freshness = freshnessOf(listing, now);
  return el('span', {
    class: ['badge', `badge--fresh-${freshness.key}`],
    title: freshness.explanation
  }, freshness.label);
}

export function photoCredit(photo) {
  if (!photo) return null;
  const parts = [photo.credit, photo.licence, photo.sourceName].filter(Boolean);
  const line = parts.join(' · ');
  if (!photo.sourceUrl) return el('span', { class: 'photo-credit' }, line);
  return el('span', { class: 'photo-credit' },
    line,
    ' · ',
    el('a', { href: photo.sourceUrl, rel: 'noopener noreferrer nofollow', target: '_blank' }, 'source page')
  );
}

/** An <img> with intrinsic size so the layout never jumps. */
export function photoImage(photo, { sizes = '100vw', className = 'photo' } = {}) {
  if (!photo) return null;
  return el('img', {
    class: className,
    src: photo.src,
    alt: photo.alt || photo.depicts || '',
    width: photo.width,
    height: photo.height,
    loading: 'lazy',
    decoding: 'async',
    sizes
  });
}

/** A deliberately honest empty photo slot: no stock imagery is invented. */
export function photoUnavailable(note = 'No openly licensed photograph of this city has been cleared for this prototype yet.') {
  return el('div', { class: 'photo photo--empty', role: 'img', 'aria-label': 'No photograph available' },
    el('p', { class: 'photo--empty__note' }, note)
  );
}

/* --- rent block ----------------------------------------------------------- */

export function rentLine(listing, { displayCurrency = null, compact = false } = {}) {
  const { amount, currency, locale, kind } = listing.rent;
  if (kind === 'unknown' || amount === null) {
    return el('div', { class: 'rent rent--unknown' },
      el('p', { class: 'rent__amount' }, UNKNOWN_TEXT),
      el('p', { class: 'rent__meta' }, kindTag('unknown'), ' Rent on application — no figure is stated, so none is shown.')
    );
  }
  const formatted = formatMoney(amount, currency, locale);
  const nodes = [
    el('p', { class: 'rent__amount' }, formatted, el('span', { class: 'rent__per' }, ' / month')),
    el('p', { class: 'rent__meta' }, kindTag(kind), listing.rent.note && !compact ? el('span', { class: 'rent__note' }, listing.rent.note) : null)
  ];
  if (displayCurrency && displayCurrency !== currency) {
    const converted = convert(amount, currency, displayCurrency);
    if (converted !== null) {
      nodes.push(el('p', { class: 'rent__converted' },
        `≈ ${formatMoney(Math.round(converted), displayCurrency)} at the illustrative rate of ${FX_RATES_AS_OF}.`,
        el('span', { class: 'rent__converted-note' }, ' Converted for comparison only.')
      ));
    }
  }
  return el('div', { class: 'rent' }, ...nodes);
}

/* --- listing card ---------------------------------------------------------- */

export function listingCard(listing, ctx = {}) {
  const { displayCurrency = null, onOpen, showCompare = true, now = Date.now() } = ctx;
  const photo = photoById(listing.photos?.[0]);
  const saved = isSaved(listing.id);
  const compared = isCompared(listing.id);
  const compareFull = ctx.compareCount >= COMPARE_MAX && !compared;

  const saveButton = el('button', {
    type: 'button',
    class: ['icon-button', saved ? 'is-on' : null],
    'aria-pressed': saved ? 'true' : 'false',
    'aria-label': saved ? `Remove ${listing.title} from saved homes` : `Save ${listing.title} to favourites`,
    title: saved ? 'Saved — click to remove' : 'Save to favourites',
    onClick: (event) => {
      event.stopPropagation();
      toggleSaved(listing.id);
      ctx.onStoreChange?.();
    }
  }, icon('heart'), el('span', { class: 'sr-only' }, saved ? 'Saved' : 'Save'));

  const compareToggle = showCompare
    ? el('label', { class: ['compare-toggle', compared ? 'is-on' : null, compareFull ? 'is-disabled' : null] },
        el('input', {
          type: 'checkbox',
          checked: compared,
          disabled: compareFull,
          'aria-label': `Add ${listing.title} to comparison`,
          onChange: () => {
            const result = toggleCompared(listing.id);
            ctx.onStoreChange?.(result);
          }
        }),
        el('span', { class: 'compare-toggle__box' }, icon('check', 14)),
        el('span', { class: 'compare-toggle__label' }, 'Compare')
      )
    : null;

  const amenities = (listing.amenities || []).slice(0, 3);

  const card = el('article', { class: ['card', `card--${listing.status}`], dataset: { id: listing.id } },
    el('div', { class: 'card__media' },
      photo ? photoImage(photo, { sizes: '(max-width: 720px) 100vw, 380px' }) : photoUnavailable()
    ),
    el('div', { class: 'card__body' },
      el('div', { class: 'card__badges' }, sampleBadge(listing, now), statusBadge(listing), freshnessBadge(listing, now)),
      el('h3', { class: 'card__title' },
        el('a', {
          href: `#/property/${listing.id}`,
          onClick: (event) => {
            if (ctx.onOpen) {
              event.preventDefault();
              ctx.onOpen(listing.id);
            }
          }
        }, listing.title)
      ),
      el('p', { class: 'card__location' }, icon('pin', 15), `${listing.area} · ${listing.city}, ${listing.country}`),
      rentLine(listing, { displayCurrency }),
      el('dl', { class: 'card__specs' },
        el('div', null, el('dt', null, 'Beds'), el('dd', null, listing.bedrooms === null ? 'Not stated' : pluralise(listing.bedrooms, 'bed'))),
        el('div', null, el('dt', null, 'Baths'), el('dd', null, listing.bathrooms === null ? 'Not stated' : formatNumber(listing.bathrooms))),
        el('div', null, el('dt', null, 'Type'), el('dd', null, listing.propertyType)),
        el('div', null, el('dt', null, 'Furnishing'), el('dd', null, listing.furnishing === 'unknown' ? 'Not stated' : listing.furnishing))
      ),
      amenities.length ? el('ul', { class: 'card__amenities' }, ...amenities.map((amenity) => el('li', null, amenity))) : el('p', { class: 'muted' }, 'No amenities are named in this record.'),
      el('div', { class: 'card__actions' },
        el('a', { class: 'button button--ghost', href: `#/property/${listing.id}` }, 'View details', icon('arrowRight', 16)),
        el('div', { class: 'card__actions-right' }, compareToggle, saveButton)
      )
    )
  );
  return card;
}

/* --- destination tile ------------------------------------------------------ */

export function destinationTile(city, ctx = {}) {
  const photo = city.photoId ? photoById(city.photoId) : null;
  const tile = el('a', {
    class: ['destination', photo ? null : 'destination--text'],
    href: `#/search?cities=${encodeURIComponent(city.id)}`,
    onClick: (event) => {
      if (ctx.onOpen) {
        event.preventDefault();
        ctx.onOpen(city.id);
      }
    }
  },
    photo
      ? el('div', { class: 'destination__media' }, photoImage(photo, { sizes: '(max-width: 720px) 50vw, 260px' }))
      : el('div', { class: 'destination__media destination__media--empty' },
          el('span', { class: 'destination__placeholder' }, 'No cleared photo')),
    el('div', { class: 'destination__body' },
      el('h3', { class: 'destination__city' }, city.name),
      el('p', { class: 'destination__meta' }, `${city.count} home${city.count === 1 ? '' : 's'} in this prototype`),
      photo ? null : el('p', { class: 'destination__note' }, 'No openly licensed photo of this city has been cleared yet, so none is shown.')
    )
  );
  return tile;
}

/** Inline credit strip under a gallery. */
export function galleryCredit(photo) {
  return el('p', { class: 'gallery__credit' }, photoCredit(photo));
}

export function verificationRow(listing, now = Date.now()) {
  return el('p', { class: 'verification' }, el('span', { class: 'verification__dot' }), verificationLine(listing, now));
}

export function amenityList(listing) {
  if (!listing.amenities?.length) return el('p', { class: 'muted' }, 'No amenities are named in this listing.');
  return el('ul', { class: 'amenity-list' }, ...listing.amenities.map((amenity) => el('li', null, icon('check', 15), amenity)));
}

export function disclosureNote() {
  return el('p', { class: 'disclosure' }, icon('info', 15), PHOTO_DISCLOSURE);
}

export function fxFootnote() {
  return el('p', { class: 'footnote' }, fxNote('INR', 'INR'));
}

export { on };
