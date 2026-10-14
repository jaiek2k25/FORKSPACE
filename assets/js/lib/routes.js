/**
 * Hash routing.
 *
 * Routes:  #/  ·  #/search  ·  #/property/:id  ·  #/compare?ids=a,b,c
 *          #/research  ·  #/saved  ·  #/sources  ·  #/not-found
 *
 * Parsing is pure and testable: it takes a hash string and returns a route
 * object. Nothing here touches the DOM.
 */
export const ROUTES = ['/', '/search', '/property', '/compare', '/research', '/saved', '/sources'];

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart || '');

  if (segments.length === 0) return { name: 'home', path: '/', params, segments };
  const [first, second] = segments;
  if (first === 'search') return { name: 'search', path: '/search', params, segments };
  if (first === 'research') return { name: 'research', path: '/research', params, segments };
  if (first === 'saved') return { name: 'saved', path: '/saved', params, segments };
  if (first === 'sources') return { name: 'sources', path: '/sources', params, segments };
  if (first === 'compare') return { name: 'compare', path: '/compare', params, segments };
  if (first === 'property' && second) {
    return { name: 'property', path: '/property', id: decodeURIComponent(second), params, segments };
  }
  return { name: 'not-found', path: `/${segments.join('/')}`, params, segments };
}

export function hrefFor(name, options = {}) {
  switch (name) {
    case 'home':
      return '#/';
    case 'search': {
      const params = options.params instanceof URLSearchParams ? options.params : new URLSearchParams(options.params || {});
      const query = params.toString();
      return query ? `#/search?${query}` : '#/search';
    }
    case 'property':
      return `#/property/${encodeURIComponent(options.id)}`;
    case 'compare': {
      const ids = options.ids || [];
      return ids.length ? `#/compare?ids=${ids.map(encodeURIComponent).join(',')}` : '#/compare';
    }
    case 'research':
      return '#/research';
    case 'saved':
      return '#/saved';
    case 'sources':
      return '#/sources';
    default:
      return '#/';
  }
}

export function navigate(name, options = {}) {
  const target = typeof name === 'string' && name.startsWith('#') ? name : hrefFor(name, options);
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = target;
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function titleForRoute(route) {
  switch (route?.name) {
    case 'home': return 'FORKSPACE — discover and compare homes worldwide';
    case 'search': return 'Search results · FORKSPACE';
    case 'property': return 'Property details · FORKSPACE';
    case 'compare': return 'Compare homes · FORKSPACE';
    case 'research': return 'Research assistant · FORKSPACE';
    case 'saved': return 'Saved homes · FORKSPACE';
    case 'sources': return 'Sources and transparency · FORKSPACE';
    default: return 'Not found · FORKSPACE';
  }
}
