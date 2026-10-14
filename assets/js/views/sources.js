/**
 * Sources — the transparency page.
 *
 * It lists every source with its type, licence, attribution, last check and
 * freshness, and it is strict about wording: the word "Verified" appears only
 * where a verification timestamp exists. Everything else is "Stated, not
 * verified", and demo rows are "Sample data · not verified".
 */
import { el, fragment, scrollArea } from '../lib/dom.js';
import { icon } from '../components/icons.js';
import { SOURCES } from '../data/sources.js';
import { sourceFreshness, freshnessOf, FRESHNESS_LABELS } from '../lib/freshness.js';
import { formatDate, formatDateTime, relativeDays, UNKNOWN_TEXT } from '../data/format.js';
import { photosByLicence, PHOTOS, PHOTO_DISCLOSURE } from '../data/photos.js';
import { LISTINGS } from '../data/listings.js';
import { duplicateSummary } from '../lib/duplicates.js';
import { FX_RATES_AS_OF, RATES_PER_INR } from '../data/fx.js';
import { SCHEMA_VERSION } from '../data/schema.js';
import { benchmarkById } from '../data/benchmarks.js';
import { loadState, STORAGE_KEY } from '../lib/store.js';

function freshnessChip(freshness) {
  return el('span', { class: ['badge', `badge--fresh-${freshness.key}`], title: freshness.explanation }, freshness.label);
}

function sourceCard(source, now) {
  const freshness = sourceFreshness(source, now);
  const verified = Boolean(source.lastCheckedAt);
  const rows = [
    ['Source type', source.kind],
    ['Licence', source.licence],
    ['Attribution', source.attribution || 'Not applicable'],
    ['Last checked', source.lastCheckedAt ? `${formatDateTime(source.lastCheckedAt)} · ${relativeDays(source.lastCheckedAt, now)}` : 'No check recorded'],
    ['Verification', verified ? `Verified · ${source.verifiedBy || 'method recorded'}` : source.kind === 'demo' ? 'Sample data · not verified' : 'Stated, not verified'],
    ['Terms', source.termsUrl ? el('a', { href: source.termsUrl, rel: 'noopener noreferrer nofollow', target: '_blank' }, source.termsUrl) : 'No terms URL recorded'],
    ['Used for', source.usedFor],
    ['State', source.state === 'connected' ? 'Connected' : 'Not connected']
  ];
  return el('article', { class: ['source-card', `source-card--${source.state}`] },
    el('div', { class: 'source-card__head' },
      el('div', null,
        el('h3', { class: 'source-card__name' }, source.name),
        source.publisher ? el('p', { class: 'source-card__publisher' }, source.publisher) : null
      ),
      el('div', { class: 'source-card__chips' },
        freshnessChip(freshness),
        el('span', { class: ['badge', source.state === 'connected' ? 'badge--connected' : 'badge--not-connected'] },
          source.state === 'connected' ? 'Connected' : 'Not connected')
      )
    ),
    el('dl', { class: 'source-card__rows' }, ...rows.map(([label, value]) =>
      el('div', { class: 'source-card__row' },
        el('dt', null, label),
        el('dd', null, value)
      ))),
    source.caveat ? el('p', { class: 'source-card__caveat' }, icon('info', 15), source.caveat) : null,
    source.url ? el('p', { class: 'source-card__link' }, el('a', { href: source.url, rel: 'noopener noreferrer nofollow', target: '_blank' }, 'Source page', icon('external', 14))) : null
  );
}

function listingFreshnessTable(now) {
  const buckets = new Map();
  for (const listing of LISTINGS) {
    const freshness = freshnessOf(listing, now);
    if (!buckets.has(freshness.key)) buckets.set(freshness.key, []);
    buckets.get(freshness.key).push({ listing, freshness });
  }
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Freshness of every record in this prototype'),
    el('p', { class: 'panel__text' }, 'Fresh means verified 7 days ago or less, aging is up to 30 days, stale is more than 30 days. Let or withdrawn homes are marked unavailable because freshness no longer applies. Demo records are sample, and anything with no timestamp at all is unverified.'),
    scrollArea('Freshness of every record in this dataset',
      el('table', { class: 'data-table data-table--freshness' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col' }, 'Home'),
          el('th', { scope: 'col' }, 'Status'),
          el('th', { scope: 'col' }, 'Last verified'),
          el('th', { scope: 'col' }, 'Freshness'),
          el('th', { scope: 'col' }, 'Wording used')
        )),
        el('tbody', null, ...LISTINGS.map((listing) => {
          const freshness = freshnessOf(listing, now);
          return el('tr', null,
            el('th', { scope: 'row' }, el('a', { href: `#/property/${listing.id}` }, listing.title), el('span', { class: 'data-table__sub' }, listing.city)),
            el('td', null, listing.status),
            el('td', null, listing.verification.lastVerifiedAt ? formatDate(listing.verification.lastVerifiedAt) : 'None'),
            el('td', null, freshnessChip(freshness)),
            el('td', null, freshness.verified ? 'Verified' : (freshness.key === 'sample' ? 'Sample data · not verified' : 'Stated, not verified'))
          );
        }))
      )
    ),
    el('p', { class: 'footnote' }, FRESHNESS_LABELS ? 'Buckets: fresh ≤ 7 days · aging ≤ 30 days · stale > 30 days · unavailable for let or withdrawn · sample for demo data · unverified when there is no timestamp.' : null)
  );
}

function photoCredits() {
  const groups = photosByLicence();
  return el('section', { class: 'panel' },
    el('div', { class: 'panel__head' },
      el('h2', { class: 'panel__title' }, `Photography credits (${Object.keys(PHOTOS).length} images)`),
      el('span', { class: 'tag tag--quiet' }, 'CC0 · CC BY · CC BY-SA · public domain')
    ),
    el('p', { class: 'panel__text' }, `Every photograph is a real, openly licensed image of a place, used under its own licence. No photograph shows any home in this dataset: ${PHOTO_DISCLOSURE}. No non-commercial and no no-derivatives material is included anywhere in this app.`),
    ...groups.map((group) => el('div', { class: 'credit-group' },
      el('h3', { class: 'credit-group__title' }, group.licence),
      el('ul', { class: 'credit-list' }, ...group.photos.map((photo) => el('li', null,
        el('strong', null, photo.depicts),
        ' — ',
        photo.credit,
        photo.attributionRequired ? ' (attribution required)' : ' (attribution not required)',
        photo.sourceUrl ? el('a', { class: 'inline-link', href: photo.sourceUrl, rel: 'noopener noreferrer nofollow', target: '_blank' }, ' file page') : null
      )))
    ))
  );
}

function duplicateReport() {
  const summary = duplicateSummary(LISTINGS);
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Duplicate detection'),
    el('p', { class: 'panel__text' }, 'Live feeds repeat the same home. FORKSPACE classifies pairs as exact (same provider record id or URL), probable (same city, area, type and bedrooms with rents within 2% plus a title or address match), or possible (rents within 5%). Possible matches are reported and never merged.'),
    el('ul', { class: 'stat-list' },
      el('li', null, el('span', { class: 'stat-list__value' }, String(summary.exact)), el('span', null, 'exact matches — the only kind that could ever be merged, and only by hand')),
      el('li', null, el('span', { class: 'stat-list__value' }, String(summary.probable)), el('span', null, 'probable matches — flagged for a human')),
      el('li', null, el('span', { class: 'stat-list__value' }, String(summary.possible)), el('span', null, 'possible matches — reported, never merged'))
    ),
    el('p', { class: 'footnote' }, `Run against the ${LISTINGS.length} sample records loaded in this page. No demolition of your data happens quietly: nothing is ever merged automatically.`)
  );
}

function openDataSection() {
  const benchmark = benchmarkById('ons-london');
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Open data used for context'),
    el('div', { class: 'open-data' },
      el('p', { class: 'open-data__line' }, el('strong', null, 'Office for National Statistics — Price Index of Private Rents (PIPR).')),
      el('p', null, 'Shown on London property pages and in research results that mention London, labelled “Area benchmark · official statistics”. Licence: Open Government Licence v3.0.'),
      el('p', null, 'It is an area average for the whole private rented stock. It is not the asking rent for a specific home, it has no bedroom split and no property-type split, and it is not a valuation.'),
      el('p', { class: 'footnote' },
        benchmark?.available && benchmark.figures
          ? `Loaded figures: London ${benchmark.figures.londonAverageMonthlyRent} GBP, UK ${benchmark.figures.ukAverageMonthlyRent} GBP, reference period ${benchmark.referencePeriod}, released ${benchmark.releasedAt}. Generated by ${benchmark.generatedBy}.`
          : 'No ONS figures are loaded in this deployment, so none are displayed rather than displaying figures of unknown provenance.',
        ' The spreadsheet is downloaded by the operator, kept outside the web root, and never served by this application.'
      )
    )
  );
}

function currencySection() {
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Currencies and conversion'),
    el('p', { class: 'panel__text' }, `Every rent is stored and displayed in the currency named by its own record. Budget filters are stored in INR and converted for display with a static, illustrative table dated ${FX_RATES_AS_OF}. Converted amounts are always labelled, and the rate is stated wherever one is used.`),
    scrollArea('Static illustrative exchange rates',
      el('table', { class: 'data-table' },
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Currency'), el('th', { scope: 'col' }, 'Units per 1 INR'))),
        el('tbody', null, ...Object.entries(RATES_PER_INR).map(([code, rate]) =>
          el('tr', null, el('th', { scope: 'row' }, code), el('td', null, String(rate)))))
      )
    ),
    el('p', { class: 'footnote' }, 'This is not a live rate feed. It is shipped with the demo build and labelled as illustrative everywhere it is used.')
  );
}

/**
 * The written detail lives in docs/, which the static handler serves. Nothing in
 * the app is hidden behind them, but a claim is easier to check when the long-form
 * version is one click away.
 */
function documentationSection() {
  const pages = [
    ['docs/INTEGRATIONS.md', 'Integrations', 'Every connection this prototype can make, the rules it follows, and what it refuses to do.'],
    ['docs/LISTING_SCHEMA.md', 'Listing schema', 'Field by field: what a record holds, what validation rejects, and how duplicates are reported.'],
    ['docs/DEPLOYMENT.md', 'Deployment', 'Running the server, the container image, the security posture, and the checklist before public use.']
  ];
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'The detail, written down'),
    el('ul', { class: 'doc-list' },
      ...pages.map(([href, title, description]) => el('li', { class: 'doc-list__item' },
        el('a', { class: 'doc-list__link', href: `/${href}`, target: '_blank', rel: 'noopener' }, title),
        el('span', { class: 'doc-list__note' }, description)
      ))
    ),
    el('p', { class: 'footnote' }, 'These pages are served from this repository. They are written for a person reading the code, not marketing copy.')
  );
}

function limitsSection() {
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'What this prototype will not do'),
    el('ul', { class: 'bullet-list bullet-list--warn' },
      el('li', null, 'It does not scrape listing sites. No source listed here is a listing site, and none can be added.'),
      el('li', null, 'It does not scrape map services. Geocoding, when enabled, uses the published Nominatim policy with one request per second, an identifying contact, a refusal to follow redirects, and no autocomplete or bulk use.'),
      el('li', null, 'It does not present an estimate as a fact, an unknown as a zero, or a sample home as a real one.'),
      el('li', null, 'It does not call a map provider for demo records, because they have no coordinates and no verified address.'),
      el('li', null, 'It does not fetch anything from the browser: no third-party analytics, no tracking pixels, no font or script from anywhere except its own origin.')
    )
  );
}

export function renderSources({ navigate, data, onStoreChange, notify }) {
  void navigate; void data; void onStoreChange; void notify;
  const now = Date.now();
  const state = loadState();
  const connected = SOURCES.filter((source) => source.state === 'connected').length;
  const unverified = SOURCES.filter((source) => !source.lastCheckedAt).length;

  return fragment(
    el('header', { class: 'page-head' },
      el('p', { class: 'page-head__eyebrow' }, 'Sources and transparency'),
      el('h1', { class: 'page-head__title' }, 'Where every number comes from'),
      el('p', { class: 'page-head__lede' }, 'This page lists each source this prototype uses, its licence, its attribution and when it was last checked. The word “Verified” is used only where a verification timestamp exists; otherwise a record is described as stated but not verified.')
    ),
    el('section', { class: 'panel panel--lead' },
      el('h2', { class: 'panel__title' }, 'The short version'),
      el('ul', { class: 'stat-list stat-list--wide' },
        el('li', null, el('span', { class: 'stat-list__value' }, String(LISTINGS.length)), el('span', null, 'fictional homes in this build, all labelled “Sample data · not verified”')),
        el('li', null, el('span', { class: 'stat-list__value' }, `${connected}/${SOURCES.length}`), el('span', null, 'sources connected')),
        el('li', null, el('span', { class: 'stat-list__value' }, String(unverified)), el('span', null, 'sources with no check timestamp yet, shown as unverified')),
        el('li', null, el('span', { class: 'stat-list__value' }, SCHEMA_VERSION), el('span', null, 'listing schema version'))
      ),
      el('p', { class: 'panel__text' }, 'Nothing on this site describes a real home. The addresses are invented, the rents are invented, and no record carries a source URL or a verification timestamp.')
    ),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel__title' }, `Sources (${SOURCES.length})`),
      el('div', { class: 'source-grid' }, ...SOURCES.map((source) => sourceCard(source, now)))
    ),
    listingFreshnessTable(now),
    duplicateReport(),
    openDataSection(),
    photoCredits(),
    currencySection(),
    documentationSection(),
    limitsSection(),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel__title' }, 'Your own data'),
      el('p', { class: 'panel__text' }, `Saved homes, shortlists, comparison selections and checklist ticks are stored in this browser under “${STORAGE_KEY}”. They are never sent to the server. The saved page has a single button that clears all of it.`),
      el('p', { class: 'footnote' }, `Schema ${state.schema}. Stored items: ${state.saved.length} saved, ${state.shortlists.length} shortlist(s), ${state.compared.length} in the comparison, ${Object.keys(state.questions || {}).length} checklist(s).`)
    )
  );
}
