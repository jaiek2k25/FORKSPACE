/**
 * Homepage — full-bleed hero, the search form, suggested destinations, and a
 * plain-language explanation of what the product does and does not do.
 */
import { el, fragment } from '../lib/dom.js';
import { icon } from '../components/icons.js';
import { destinationTile, photoImage } from '../components/cards.js';
import { CITIES, CITIES_WITHOUT_PHOTO } from '../data/cities.js';
import { DEMO_COUNTS } from '../data/listings.js';
import { PROPERTY_TYPE_OPTIONS, FURNISHING_OPTIONS } from '../lib/filters.js';
import { CURRENCIES, FX_RATES_AS_OF } from '../data/fx.js';
import { toInr } from '../data/fx.js';

const EXAMPLE_BRIEFS = [
  'furnished one-bedroom in a walkable area',
  'two bedrooms under a fixed monthly budget',
  'quiet flat with a long lease and a short commute'
];

function filterField(label, control, hint) {
  return el('div', { class: 'field' },
    el('label', { class: 'field__label', for: control.id || undefined }, label),
    control,
    hint ? el('p', { class: 'field__hint' }, hint) : null
  );
}

function select(id, options, { placeholder } = {}) {
  return el('select', { class: 'input', id, name: id },
    placeholder ? el('option', { value: '' }, placeholder) : null,
    ...options.map((option) => el('option', { value: option.value }, option.label))
  );
}

export function renderHome({ navigate, data }) {
  const form = el('form', { class: 'search-form', role: 'search', 'aria-label': 'Search rental homes' });
  const destination = el('input', {
    class: 'input input--search',
    id: 'home-destination',
    name: 'q',
    type: 'search',
    placeholder: 'City, neighbourhood, address or destination',
    'aria-label': 'City, neighbourhood, address or destination',
    autocomplete: 'off',
    maxlength: '120'
  });
  const currency = select('home-currency', CURRENCIES.map((code) => ({ value: code, label: code })), {});
  currency.value = 'INR';
  const rentMin = el('input', { class: 'input', id: 'home-rent-min', name: 'rentMin', type: 'number', min: '0', step: '100', placeholder: 'No minimum', 'aria-label': 'Minimum monthly rent' });
  const rentMax = el('input', { class: 'input', id: 'home-rent-max', name: 'rentMax', type: 'number', min: '0', step: '100', placeholder: 'No maximum', 'aria-label': 'Maximum monthly rent' });
  const type = select('home-type', PROPERTY_TYPE_OPTIONS.map((value) => ({ value, label: value })), { placeholder: 'Any property type' });
  const bedrooms = select('home-beds', [1, 2, 3, 4].map((value) => ({ value: String(value), label: `${value}+ bedrooms` })), { placeholder: 'Any number of bedrooms' });
  const furnishing = select('home-furnishing', FURNISHING_OPTIONS.map((value) => ({ value, label: value })), { placeholder: 'Any furnishing' });
  const lease = select('home-lease', [3, 6, 11, 12, 24].map((value) => ({ value: String(value), label: `${value}+ months` })), { placeholder: 'Any lease length' });

  function submit(event) {
    event?.preventDefault();
    const params = new URLSearchParams();
    if (destination.value.trim()) params.set('q', destination.value.trim());
    const chosenCurrency = currency.value || 'INR';
    if (rentMin.value) params.set('rentMin', String(Math.round(toInr(Number(rentMin.value), chosenCurrency))));
    if (rentMax.value) params.set('rentMax', String(Math.round(toInr(Number(rentMax.value), chosenCurrency))));
    if (type.value) params.set('types', type.value);
    if (bedrooms.value) params.set('beds', bedrooms.value);
    if (furnishing.value) params.set('furnishing', furnishing.value);
    if (lease.value) params.set('lease', lease.value);
    if (chosenCurrency !== 'INR') params.set('cur', chosenCurrency);
    navigate('search', { params });
  }

  form.addEventListener('submit', submit);

  form.append(
    el('div', { class: 'search-form__main' },
      el('div', { class: 'search-form__input' },
        icon('search', 20),
        destination
      ),
      el('button', { class: 'button button--primary', type: 'submit' }, 'Search homes')
    ),
    el('div', { class: 'search-form__filters' },
      el('div', { class: 'search-form__filters-head' },
        el('h2', { class: 'search-form__filters-title' }, 'Filters'),
        el('p', { class: 'search-form__filters-note' }, 'Budgets are entered in the currency you pick and stored in INR so mixed currencies can be compared honestly.')
      ),
      el('div', { class: 'filters-grid' },
        filterField('Currency for the rent range', currency, `Converted with the illustrative static FX table dated ${FX_RATES_AS_OF}.`),
        el('div', { class: 'field field--range' },
          el('span', { class: 'field__label' }, 'Monthly rent range'),
          el('div', { class: 'field__range-inputs' }, rentMin, el('span', { class: 'field__range-sep' }, 'to'), rentMax)
        ),
        filterField('Property type', type),
        filterField('Bedrooms', bedrooms),
        filterField('Furnished status', furnishing),
        filterField('Lease duration', lease)
      )
    )
  );

  const heroPhoto = null; // The hero is typographic: no stock imagery is implied to be a listing.

  const destinationTiles = CITIES.map((city) => destinationTile(city, {
    onOpen: (cityId) => navigate('search', { params: new URLSearchParams({ cities: cityId }) })
  }));

  const helpItems = [
    {
      icon: 'info',
      title: 'Separates what is known from what is not',
      text: 'Every amount is labelled known, estimate or unknown. Unknown costs are never added into a total, so a breakdown cannot quietly invent a number.'
    },
    {
      icon: 'columns',
      title: 'Compares homes, not brochures',
      text: 'Put two to four homes side by side on rent, upfront cost, recurring fees, amenities and what each record fails to say.'
    },
    {
      icon: 'pin',
      title: 'Labels estimates as estimates',
      text: 'Walkability and commute figures are prototype estimates, marked as such, and shown as "not available" when there is nothing to estimate from.'
    },
    {
      icon: 'spark',
      title: 'A research assistant that shows its work',
      text: 'Describe what you need in your own words. It states which requirements it understood, which it could not check, and why a home was excluded.'
    }
  ];

  const exampleChips = EXAMPLE_BRIEFS.map((brief) =>
    el('button', {
      type: 'button',
      class: 'chip chip--quiet',
      onClick: () => navigate('research', { params: new URLSearchParams({ brief }) })
    }, brief)
  );

  return fragment(
    el('section', { class: 'hero' },
      el('div', { class: 'hero__inner' },
        el('p', { class: 'hero__eyebrow' }, 'Rental research · transparency first'),
        el('h1', { class: 'hero__title' }, 'Discover and compare rental homes worldwide, with the gaps left visible.'),
        el('p', { class: 'hero__lede' }, 'FORKSPACE gathers a home, its costs and its caveats in one place, then shows you what nobody has told you yet. Built as a working prototype with a fully fictional sample of homes.'),
        form,
        el('p', { class: 'hero__note' },
          `Sample dataset: ${DEMO_COUNTS.listings} fictional homes across ${DEMO_COUNTS.cities} cities and ${DEMO_COUNTS.currencies} currencies. These are invented records, not real listings.`,
          heroPhoto
        )
      )
    ),
    el('section', { class: 'section' },
      el('div', { class: 'section__head' },
        el('h2', { class: 'section__title' }, 'Suggested destinations'),
        el('p', { class: 'section__lede' }, CITIES_WITHOUT_PHOTO.length
          ? `Photographs are real, openly licensed images of each city. ${CITIES_WITHOUT_PHOTO.join(' and ')} ${CITIES_WITHOUT_PHOTO.length === 1 ? 'has' : 'have'} no cleared photograph yet, so ${CITIES_WITHOUT_PHOTO.length === 1 ? 'its tile says so' : 'those tiles say so'} rather than borrowing a picture of somewhere else.`
          : 'Photographs are real, openly licensed images of each city, credited on each card.')
      ),
      el('div', { class: 'destinations' }, ...destinationTiles)
    ),
    el('section', { class: 'section section--tinted' },
      el('div', { class: 'section__head' },
        el('h2', { class: 'section__title' }, 'How it helps renters'),
        el('p', { class: 'section__lede' }, 'Four things this prototype does deliberately, and the reason each one exists.')
      ),
      el('div', { class: 'help-grid' }, ...helpItems.map((item) =>
        el('article', { class: 'help-card' },
          el('span', { class: 'help-card__icon' }, icon(item.icon, 20)),
          el('h3', { class: 'help-card__title' }, item.title),
          el('p', { class: 'help-card__text' }, item.text)
        )
      ))
    ),
    el('section', { class: 'section' },
      el('div', { class: 'section__head' },
        el('h2', { class: 'section__title' }, 'Start with the research assistant'),
        el('p', { class: 'section__lede' }, 'Describe the home you want in a sentence. The assistant explains what it understood, what it could not check, and why some homes were excluded.')
      ),
      el('div', { class: 'example-briefs' }, ...exampleChips),
      el('div', { class: 'cta-row' },
        el('a', { class: 'button button--primary', href: '#/search' }, 'Browse every sample home', icon('arrowRight', 16)),
        el('a', { class: 'button button--ghost', href: '#/sources' }, 'See where the data comes from')
      ),
      el('p', { class: 'footnote' }, 'Photographs illustrate cities, not the homes described. Every gallery carries the caption “Illustrative photos · not of this specific home”.')
    )
  );
}

export function homePhoto(photo) {
  return photoImage(photo);
}
