/**
 * Application shell and router.
 *
 * Responsibilities, kept deliberately small:
 *   - render the header, footer and toast region once
 *   - parse the hash, pick a view, render it into <main>
 *   - keep the document title, the active nav state and the compare counter current
 *   - remount the view when device state changes in a way that affects badges
 */
import { el, fragment, clear } from './lib/dom.js';
import { parseHash, titleForRoute, hrefFor } from './lib/routes.js';
import { LISTINGS } from './data/listings.js';
import { api } from './lib/api.js';
import { icon } from './components/icons.js';
import { destroyAllMaps } from './lib/map.js';
import { loadState, subscribe, STORAGE_KEY, storageAvailable } from './lib/store.js';
import { renderHome } from './views/home.js';
import { renderSearch } from './views/search.js';
import { renderProperty } from './views/property.js';
import { renderCompare } from './views/compare.js';
import { renderResearch } from './views/research.js';
import { renderSaved } from './views/saved.js';
import { renderSources } from './views/sources.js';
import { VERSION_CLIENT } from './lib/version.js';

const NAV_ITEMS = [
  { name: 'search', label: 'Search' },
  { name: 'research', label: 'Research assistant' },
  { name: 'compare', label: 'Compare' },
  { name: 'saved', label: 'Saved' },
  { name: 'sources', label: 'Sources' }
];

const VIEWS = {
  home: renderHome,
  search: renderSearch,
  property: renderProperty,
  compare: renderCompare,
  research: renderResearch,
  saved: renderSaved,
  sources: renderSources
};

/** Data loaded once: the API copy when available, the bundled copy otherwise. */
let data = { listings: LISTINGS, apiAvailable: false };

export async function bootData() {
  const result = await api.listings();
  if (result.ok && Array.isArray(result.data?.listings) && result.data.listings.length) {
    data = { listings: result.data.listings, apiAvailable: true, generatedAt: result.data.generatedAt };
  }
  return data;
}

function notify(message, tone = 'info') {
  const region = document.getElementById('toasts');
  if (!region) return;
  const toast = el('div', { class: ['toast', `toast--${tone}`] },
    icon(tone === 'warn' ? 'alert' : 'info', 16),
    el('span', null, message)
  );
  region.append(toast);
  window.setTimeout(() => {
    toast.classList.add('toast--out');
    window.setTimeout(() => toast.remove(), 240);
  }, 4800);
}

function buildHeader(route) {
  const nav = document.getElementById('site-nav');
  if (!nav) return;
  const state = loadState();
  clear(nav);
  nav.append(...NAV_ITEMS.map((item) => {
    const isActive = route.name === item.name || (item.name === 'search' && route.name === 'property');
    const badge = item.name === 'compare' ? state.compared.length : item.name === 'saved' ? state.saved.length : 0;
    return el('a', {
      class: ['site-nav__link', isActive ? 'is-active' : null],
      href: hrefFor(item.name),
      'aria-current': isActive ? 'page' : null
    },
      item.label,
      badge ? el('span', { class: 'site-nav__badge', 'aria-label': `${badge} selected` }, String(badge)) : null
    );
  }));
}

function buildFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;
  clear(footer);
  footer.append(el('div', { class: 'container site-footer__inner' },
    el('div', { class: 'site-footer__col' },
      el('p', { class: 'site-footer__brand' }, 'FORKSPACE'),
      el('p', { class: 'site-footer__note' }, 'A working prototype for rental discovery, comparison and research. Transparency over hype, evidence over claims.')
    ),
    el('div', { class: 'site-footer__col' },
      el('h2', { class: 'site-footer__title' }, 'This build'),
      el('ul', { class: 'site-footer__list' },
        el('li', null, `${LISTINGS.length} fictional sample homes, labelled as such`),
        el('li', null, 'No real listing, landlord or address anywhere'),
        el('li', null, 'Photographs are openly licensed images of places, credited per image'),
        el('li', null, `Device storage key: ${STORAGE_KEY}${storageAvailable ? '' : ' (blocked in this browser)'}`)
      )
    ),
    el('div', { class: 'site-footer__col' },
      el('h2', { class: 'site-footer__title' }, 'Go to'),
      el('ul', { class: 'site-footer__list site-footer__list--links' },
        el('li', null, el('a', { href: '#/search' }, 'Search sample homes')),
        el('li', null, el('a', { href: '#/research' }, 'Research assistant')),
        el('li', null, el('a', { href: '#/saved' }, 'Saved homes')),
        el('li', null, el('a', { href: '#/sources' }, 'Sources and transparency'))
      )
    ),
    el('p', { class: 'site-footer__version' }, `Interface build ${VERSION_CLIENT}`)
  ));
}

function renderRoute(route, { announce = false } = {}) {
  const main = document.getElementById('main');
  if (!main) return;
  const view = VIEWS[route.name];
  const context = {
    route,
    data,
    navigate: (name, options) => {
      const target = typeof name === 'string' && name.startsWith('#') ? name : hrefFor(name, options);
      if (window.location.hash === target) render();
      else window.location.hash = target;
    },
    notify,
    onStoreChange: (result) => {
      buildHeader(parseHash(window.location.hash));
      if (result && result.ok === false && result.reason) notify(result.reason, 'warn');
    }
  };

  // Leaflet keeps window and document listeners per instance, so every map is
  // removed before the view that owns it is replaced.
  destroyAllMaps();

  clear(main);
  if (!view) {
    main.append(el('div', { class: 'state' },
      el('h1', { class: 'state__title' }, 'That page does not exist'),
      el('p', { class: 'state__text' }, `No route matches “${route.path}”. The prototype has home, search, property, compare, research, saved and sources.`),
      el('div', { class: 'cta-row' },
        el('a', { class: 'button button--primary', href: '#/' }, 'Back to the homepage'),
        el('a', { class: 'button button--ghost', href: '#/search' }, 'Search sample homes')
      )
    ));
  } else {
    try {
      main.append(view(context));
    } catch (error) {
      // A render failure must never leave a blank page.
      main.append(el('div', { class: 'state' },
        el('h1', { class: 'state__title' }, 'Something went wrong rendering this page'),
        el('p', { class: 'state__text' }, 'The rest of the app still works. Try another route, or reload.'),
        el('p', { class: 'footnote' }, String(error && error.message ? error.message : error)),
        el('div', { class: 'cta-row' }, el('a', { class: 'button button--primary', href: '#/' }, 'Homepage'))
      ));
      // eslint-disable-next-line no-console
      console.error('FORKSPACE render error', error);
    }
  }

  document.title = titleForRoute(route);
  buildHeader(route);
  buildFooter();
  if (announce) {
    const heading = main.querySelector('h1, h2, .state__title');
    if (heading) heading.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }
}

function render() {
  const route = parseHash(window.location.hash);
  renderRoute(route, { announce: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.documentElement.dataset.route = route.name;
  document.documentElement.dataset.routePath = route.name === 'property' ? `/property/${route.id}` : route.path;
}

let started = false;

export async function startApp() {
  if (started) return;
  started = true;
  if (!window.location.hash) window.location.hash = '#/';
  await bootData();
  window.addEventListener('hashchange', render);
  subscribe(() => buildHeader(parseHash(window.location.hash)));
  render();
  // Small hook for the browser test suite and for debugging. Read-only facts only.
  window.__forkspace = {
    version: VERSION_CLIENT,
    routes: Object.keys(VIEWS),
    listings: () => data.listings.length,
    dataSource: () => (data.apiAvailable ? 'api' : 'bundled'),
    route: () => parseHash(window.location.hash)
  };
}

export { notify, render as renderCurrentRoute, fragment };
