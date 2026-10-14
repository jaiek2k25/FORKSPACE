/**
 * Research assistant.
 *
 * The brief goes to the server, which either runs the deterministic mock reader
 * or, when a key is configured, asks the model for a preference JSON object.
 * Whichever happens, the matching, scoring, cost maths and wording below are
 * computed here in code — the model never scores a home.
 *
 * The banner always names the adapter and the model, and the page states in
 * plain words that this searches no further than the records it has.
 */
import { el, fragment, replace, scrollArea } from '../lib/dom.js';
import { icon } from '../components/icons.js';
import { kindTag, sampleBadge } from '../components/cards.js';
import { api } from '../lib/api.js';
import { LISTINGS } from '../data/listings.js';
import { extractPreferences, researchReport, normalisePreferences, BRIEF_LIMIT } from '../lib/research.js';
import { formatMoney, formatNumber, pluralise } from '../data/format.js';
import { benchmarkById } from '../data/benchmarks.js';

const EXAMPLE_BRIEFS = [
  'Furnished one-bedroom in a walkable neighbourhood, under €1,600 a month, commute under 30 minutes',
  'Two bedrooms in Bengaluru with a lift, a lease of at least 11 months, budget ₹70,000',
  'Quiet home in Toronto with a den, walkable, not more than C$2,600',
  'Two bedrooms in Mexico City under MX$30,000 with two bathrooms'
];

function stateTag(state) {
  const labels = { met: 'Met', not_met: 'Not met', unknown: 'Unknown' };
  return el('span', { class: ['criterion', `criterion--${state}`] }, labels[state] || 'Unknown');
}

function matchCard(entry, index) {
  const { listing, criteria, score } = entry;
  const photos = listing.photos?.length ? listing.photos : [];
  void photos;
  return el('article', { class: 'match', dataset: { id: listing.id } },
    el('div', { class: 'match__head' },
      el('div', null,
        el('p', { class: 'match__rank' }, index === 0 ? 'Closest to your brief' : `Match ${index + 1}`),
        el('h3', { class: 'match__title' }, el('a', { href: `#/property/${listing.id}` }, listing.title)),
        el('p', { class: 'match__location' }, `${listing.area} · ${listing.city}, ${listing.country}`)
      ),
      el('div', { class: 'match__score' },
        el('p', { class: 'match__score-value' }, `${score.met}/${criteria.length}`),
        el('p', { class: 'match__score-label' }, 'criteria met'),
        sampleBadge(listing)
      )
    ),
    el('ul', { class: 'match__criteria' }, ...criteria.map((criterion) => el('li', { class: 'criteria-row' },
      stateTag(criterion.state),
      el('div', null,
        el('p', { class: 'criteria-row__label' }, criterion.label),
        el('p', { class: 'criteria-row__evidence' }, criterion.evidence)
      )
    ))),
    entry.stillMissing.length
      ? el('div', { class: 'match__missing' },
          el('h4', { class: 'match__missing-title' }, 'Still missing'),
          el('ul', { class: 'bullet-list' }, ...entry.stillMissing.map((item) => el('li', null, item))))
      : null
  );
}

function excludedTable(excluded) {
  if (!excluded.length) return null;
  return el('section', { class: 'panel' },
    el('h2', { class: 'panel__title' }, 'Excluded by a hard limit, with reasons'),
    el('p', { class: 'panel__text' }, 'A hard limit is never negotiated away. These homes were dropped before scoring, and the reason is stated so you can change your brief deliberately if you want to.'),
    scrollArea('Homes excluded by a hard limit, with reasons',
      el('table', { class: 'data-table data-table--exclusions' },
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Home'), el('th', { scope: 'col' }, 'Reason'))),
        el('tbody', null, ...excluded.map((entry) => el('tr', null,
          el('th', { scope: 'row' }, `${entry.listing.title}`, el('span', { class: 'data-table__sub' }, `${entry.listing.area} · ${entry.listing.city}`)),
          el('td', null, entry.reasons.join(' '))
        )))
      )
    )
  );
}

function comparisonSummary(summary) {
  if (!summary?.rows?.length) return el('p', { class: 'panel__text' }, summary?.note || 'Nothing to compare.');
  return fragment(
    el('p', { class: 'panel__text' }, summary.note),
    scrollArea('Comparison summary of the matched homes',
      el('table', { class: 'data-table data-table--summary' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col' }, 'Home'),
          el('th', { scope: 'col' }, 'Rent'),
          el('th', { scope: 'col' }, 'Known monthly extras'),
          el('th', { scope: 'col' }, 'Estimated extras'),
          el('th', { scope: 'col' }, 'Known upfront'),
          el('th', { scope: 'col' }, 'Criteria met'),
          el('th', { scope: 'col' }, 'Unknown')
        )),
        el('tbody', null, ...summary.rows.map((row) => el('tr', null,
          el('th', { scope: 'row' }, row.title, el('span', { class: 'data-table__sub' }, row.city)),
          el('td', null, row.rent.text, ' ', kindTag(row.rent.kind)),
          el('td', null, row.monthlyKnown ? formatMoney(row.monthlyKnown, row.currency) : '—'),
          el('td', null, row.monthlyEstimates ? formatMoney(row.monthlyEstimates, row.currency) : '—'),
          el('td', null, row.upfrontKnown ? formatMoney(row.upfrontKnown, row.currency) : '—'),
          el('td', null, String(row.met)),
          el('td', null, String(row.unknown))
        )))
      )
    )
  );
}

export function renderResearch({ route, navigate, data, notify }) {
  const pool = data.listings?.length ? data.listings : LISTINGS;
  const initialBrief = route.params.get('brief') || '';
  let status = null;
  let running = false;

  const textarea = el('textarea', {
    class: 'input input--textarea',
    id: 'research-brief',
    name: 'brief',
    rows: '5',
    maxlength: String(BRIEF_LIMIT),
    placeholder: 'For example: furnished one-bedroom in a walkable neighbourhood, under €1,600 a month, commute under 30 minutes',
    'aria-describedby': 'research-help research-count'
  });
  textarea.value = initialBrief.slice(0, BRIEF_LIMIT);

  const counter = el('p', { class: 'brief__count', id: 'research-count' });
  const bannerSlot = el('div', { class: 'adapter-banner-slot' });
  const resultsSlot = el('div', { class: 'research__results', 'aria-live': 'polite' });

  function updateCounter() {
    counter.textContent = `${textarea.value.length} of ${BRIEF_LIMIT} characters.`;
  }
  textarea.addEventListener('input', updateCounter);
  updateCounter();

  async function loadStatus() {
    const result = await api.aiStatus();
    if (result.ok) {
      status = result.data;
    } else {
      status = {
        adapter: 'mock',
        model: null,
        modelConfigured: false,
        warning: 'The server status endpoint could not be reached, so the built-in demo reader was used.',
        disclosure: 'Demo adapter. Reads the sample records loaded in this page only.'
      };
    }
    renderBanner();
  }

  function renderBanner() {
    const info = status || { adapter: 'mock', model: null, modelConfigured: false };
    const isModel = info.adapter === 'model';
    replace(bannerSlot, 
      el('div', { class: ['adapter-banner', isModel ? 'adapter-banner--model' : 'adapter-banner--mock'] },
        el('div', { class: 'adapter-banner__main' },
          el('span', { class: 'adapter-banner__icon' }, icon(isModel ? 'spark' : 'info', 18)),
          el('div', null,
            el('p', { class: 'adapter-banner__title' },
              isModel ? 'Model adapter in use' : 'Demo adapter in use (no model key configured)'),
            el('p', { class: 'adapter-banner__detail' },
              `Adapter: ${info.adapter} · Model: ${info.model || 'none — deterministic reader'}`)
          )
        ),
        el('p', { class: 'adapter-banner__disclosure' },
          info.warning ? `${info.warning} ` : '',
          'This is a demo. The assistant reads only the 13 fictional sample homes loaded in this prototype; it does not search the internet, does not contact landlords, and no real-world result is implied.'
        )
      )
    );
  }

  function renderEmpty() {
    replace(resultsSlot, 
      el('div', { class: 'state' },
        el('h2', { class: 'state__title' }, 'Describe the home you want'),
        el('p', { class: 'state__text' }, 'One or two sentences is enough. The assistant turns them into requirements, scores every sample home against them, and tells you which parts of your brief it could not check.'),
        el('div', { class: 'state__suggestions' },
          ...EXAMPLE_BRIEFS.map((brief) => el('button', {
            type: 'button',
            class: 'chip',
            onClick: () => {
              textarea.value = brief.slice(0, BRIEF_LIMIT);
              updateCounter();
              run();
            }
          }, brief))
        ),
        el('ul', { class: 'bullet-list bullet-list--quiet' },
          el('li', null, 'Hard limits — city, maximum rent, bedrooms, property type — are never negotiated away. Failing homes are listed with their reason.'),
          el('li', null, 'Criteria are met, not met, or unknown. An unknown is never scored as met.'),
          el('li', null, 'Every figure comes from the record and carries its known/estimate/unknown label.')
        )
      )
    );
  }

  function renderLoading() {
    replace(resultsSlot, el('div', { class: 'state' },
      el('h2', { class: 'state__title' }, 'Reading your brief…'),
      el('p', { class: 'state__text' }, 'Extracting requirements, then scoring the sample homes in code.')
    ));
  }

  function renderReport(report, extraNote) {
    const summary = report.comparisonSummary;
    replace(resultsSlot, 
      el('section', { class: 'panel' },
        el('div', { class: 'panel__head' },
          el('h2', { class: 'panel__title' }, 'What the assistant understood'),
          el('span', { class: 'tag tag--quiet' }, `${report.counts.considered} homes read`)
        ),
        extraNote ? el('p', { class: 'panel__text panel__text--warn' }, extraNote) : null,
        report.requirements.length
          ? scrollArea('Requirements the assistant understood',
              el('table', { class: 'data-table data-table--requirements' },
                el('thead', null, el('tr', null,
                  el('th', { scope: 'col' }, 'Requirement'),
                  el('th', { scope: 'col' }, 'Understood as'),
                  el('th', { scope: 'col' }, 'How it is treated')
                )),
                el('tbody', null, ...report.requirements.map((row) => el('tr', null,
                  el('th', { scope: 'row' }, row.label),
                  el('td', null, row.value),
                  el('td', null, row.hardLimit ? 'Hard limit — failing homes are excluded' : row.note)
                )))
              )
            )
          : el('p', { class: 'panel__text' }, 'No requirements were recognised in that brief. Try naming a city, a monthly rent, a number of bedrooms or a property type.'),
        el('p', { class: 'footnote' }, report.disclosure)
      ),
      el('section', { class: 'panel' },
        el('div', { class: 'panel__head' },
          el('h2', { class: 'panel__title' }, 'Matches, with reasons'),
          el('span', { class: 'tag tag--quiet' }, `${report.counts.matched} scored · ${report.counts.fullyMet} with nothing failed or unknown`)
        ),
        report.matches.length
          ? el('div', { class: 'matches' }, ...report.matches.slice(0, 6).map((entry, index) => matchCard(entry, index)))
          : el('p', { class: 'panel__text' }, 'No sample home passed the hard limits you set. The excluded list below shows exactly why.')
      ),
      excludedTable(report.excluded),
      el('section', { class: 'panel' },
        el('h2', { class: 'panel__title' }, 'Trade-offs'),
        report.tradeoffs.length
          ? el('ul', { class: 'tradeoffs' }, ...report.tradeoffs.map((item) => el('li', null,
              el('p', { class: 'tradeoffs__title' }, `${item.title} · ${item.city}`),
              el('ul', { class: 'bullet-list' }, ...item.lines.map((line) => el('li', null, line)))
            )))
          : el('p', { class: 'panel__text' }, 'Every matched home met the criteria that could be checked, with nothing left over.')
      ),
      el('section', { class: 'panel' },
        el('h2', { class: 'panel__title' }, 'Missing information'),
        report.missingInformation.length
          ? el('ul', { class: 'bullet-list' }, ...report.missingInformation.map((item) => el('li', null, item)))
          : el('p', { class: 'panel__text' }, 'Nothing was flagged as missing for the matched homes.')
      ),
      el('section', { class: 'panel' },
        el('h2', { class: 'panel__title' }, 'Still missing from your brief'),
        report.stillMissing.length
          ? el('ul', { class: 'bullet-list bullet-list--warn' }, ...report.stillMissing.map((item) => el('li', null, item)))
          : el('p', { class: 'panel__text' }, 'Your brief covered a city, a rent limit and a commute limit, so nothing obvious was left out.'),
        el('p', { class: 'footnote' }, 'If you did not give a rent limit or a commute limit, this prototype says so rather than guessing one.')
      ),
      el('section', { class: 'panel' },
        el('h2', { class: 'panel__title' }, 'Comparison summary'),
        comparisonSummary(summary),
        el('p', { class: 'footnote' }, 'Amounts are never converted into a single number here: known and estimated parts stay separate, and unknown costs are excluded from every column.')
      ),
      el('section', { class: 'panel' },
        el('h2', { class: 'panel__title' }, 'Questions to investigate'),
        el('ul', { class: 'bullet-list' }, ...report.questionsToInvestigate.map((item) => el('li', null, item))),
        el('p', { class: 'footnote' }, `Generated ${new Date(report.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC for a brief of ${formatNumber(report.briefLength)} characters.`)
      ),
      benchmarkNoteFor(report)
    );
  }

  function benchmarkNoteFor(report) {
    const london = benchmarkById('ons-london');
    const touchesLondon = report.requirements.some((row) => String(row.value).toLowerCase().includes('london'))
      || report.matches.some((entry) => entry.listing.cityId === 'london');
    if (!touchesLondon) return null;
    return el('section', { class: 'panel panel--benchmark' },
      el('h2', { class: 'panel__title' }, 'Area benchmark · official statistics'),
      el('p', { class: 'panel__text' }, 'Your brief mentions London. The official statistics below are an area average for the whole private rented stock, published by the Office for National Statistics. They are not a price for any of the homes above and they have no bedroom split.'),
      london?.available && london.figures
        ? el('p', { class: 'benchmark-inline' },
            `London average monthly rent ${formatMoney(london.figures.londonAverageMonthlyRent, 'GBP', 'en-GB')} · UK average ${formatMoney(london.figures.ukAverageMonthlyRent, 'GBP', 'en-GB')} (reference period ${london.referencePeriod}).`)
        : el('p', { class: 'panel__text' }, 'The official statistics file is not loaded in this deployment, so no benchmark figure is shown.'),
      el('p', { class: 'footnote' }, london?.sourceUrl ? el('a', { href: london.sourceUrl, rel: 'noopener noreferrer nofollow', target: '_blank' }, 'ONS source bulletin') : null)
    );
  }

  async function run() {
    if (running) return;
    const brief = textarea.value.slice(0, BRIEF_LIMIT).trim();
    if (!brief) {
      notify?.('Write a sentence or two first — the assistant needs something to read.', 'warn');
      textarea.focus();
      return;
    }
    running = true;
    renderLoading();

    let adapter = status?.adapter || 'mock';
    let model = status?.model || null;
    let preferences = null;
    let extraNote = null;

    if (adapter === 'model') {
      const response = await api.extract(brief);
      if (response.ok) {
        const normalised = normalisePreferences(response.data?.preferences || {});
        preferences = normalised.preferences;
        adapter = response.data?.adapter || 'model';
        model = response.data?.model || model;
        if (normalised.dropped.length) {
          extraNote = `The model returned ${normalised.dropped.length} field${normalised.dropped.length === 1 ? '' : 's'} this app does not accept, so ${normalised.dropped.length === 1 ? 'it was' : 'they were'} discarded before scoring.`;
        }
        if (response.data?.warning) extraNote = `${extraNote ? `${extraNote} ` : ''}${response.data.warning}`;
      } else {
        adapter = 'mock';
        extraNote = `The model adapter could not be used (${response.error.message}) so the deterministic demo reader produced this report instead.`;
      }
    }

    // The deterministic reader is also the fallback, and always the scorer.
    const heuristic = extractPreferences(brief, { listings: pool });
    const mergedPreferences = preferences && Object.keys(preferences).length ? preferences : heuristic.preferences;
    const report = researchReport({
      brief,
      preferences: mergedPreferences,
      listings: pool,
      adapter,
      model,
      meta: heuristic.understood
    });
    running = false;
    renderReport(report, extraNote);
    resultsSlot.scrollIntoView({ block: 'nearest' });
  }

  const form = el('form', { class: 'brief-form', onSubmit: (event) => { event.preventDefault(); run(); } },
    el('label', { class: 'field__label', for: 'research-brief' }, 'Describe what you are looking for'),
    textarea,
    el('p', { class: 'field__hint', id: 'research-help' }, `Up to ${BRIEF_LIMIT} characters. Named cities, a monthly rent, bedroom counts, property types, furnishings and lease lengths are read directly.`),
    el('div', { class: 'brief-form__actions' }, counter,
      el('div', { class: 'brief-form__buttons' },
        el('button', { type: 'button', class: 'button button--quiet', onClick: () => { textarea.value = ''; updateCounter(); textarea.focus(); } }, 'Clear'),
        el('button', { type: 'submit', class: 'button button--primary' }, icon('spark', 16), 'Run the assistant')
      )
    )
  );

  const page = el('article', { class: 'research' },
    el('header', { class: 'page-head' },
      el('p', { class: 'page-head__eyebrow' }, 'Research assistant'),
      el('h1', { class: 'page-head__title' }, 'Describe the home you want, in your own words'),
      el('p', { class: 'page-head__lede' }, 'The assistant turns a sentence into requirements, then scores the sample homes in code. It shows what it understood, what it could not check, and why anything was excluded.')
    ),
    bannerSlot,
    form,
    resultsSlot
  );

  renderEmpty();
  loadStatus();
  if (initialBrief) run();

  return page;
}
