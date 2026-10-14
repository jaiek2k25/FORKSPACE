/**
 * Device state, kept in localStorage under a single versioned key.
 *
 * Only three things are stored: saved homes, named shortlists, the current
 * comparison selection, and the ticks on the "questions to ask" checklists.
 * Nothing about a visitor is sent anywhere — there is no account and no server
 * session. State is per browser and can be cleared from the saved page.
 */
export const STORAGE_KEY = 'forkspace.v1';
export const SCHEMA = 1;

export function defaultState() {
  return {
    schema: SCHEMA,
    saved: [],
    shortlists: [],
    compared: [],
    questions: {},
    recentSearches: [],
    filters: null,
    sort: 'relevance'
  };
}

/** localStorage may be unavailable (private mode, disabled storage). Be honest, never throw. */
function storage() {
  try {
    const test = '__forkspace_probe__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    return null;
  }
}

let cache = null;
const listeners = new Set();
export let storageAvailable = true;

function coerce(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    schema: SCHEMA,
    saved: Array.isArray(raw.saved) ? raw.saved.filter((id) => typeof id === 'string') : [],
    shortlists: Array.isArray(raw.shortlists)
      ? raw.shortlists
          .filter((list) => list && typeof list.id === 'string')
          .map((list) => ({ id: list.id, name: String(list.name || 'Shortlist'), items: Array.isArray(list.items) ? list.items.filter((id) => typeof id === 'string') : [] }))
      : [],
    compared: Array.isArray(raw.compared) ? raw.compared.filter((id) => typeof id === 'string').slice(0, 4) : [],
    questions: raw.questions && typeof raw.questions === 'object' ? raw.questions : {},
    recentSearches: Array.isArray(raw.recentSearches) ? raw.recentSearches.filter((value) => typeof value === 'string').slice(0, 8) : []
  };
}

export function loadState() {
  if (cache) return cache;
  const store = storage();
  if (!store) {
    storageAvailable = false;
    cache = defaultState();
    return cache;
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    cache = coerce(raw ? JSON.parse(raw) : null);
  } catch {
    cache = defaultState();
  }
  return cache;
}

export function saveState(next) {
  cache = coerce(next);
  const store = storage();
  storageAvailable = Boolean(store);
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      storageAvailable = false;
    }
  }
  for (const listener of listeners) listener(cache);
  return cache;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function update(mutator) {
  const next = { ...loadState() };
  mutator(next);
  return saveState(next);
}

export function resetState() {
  return saveState(defaultState());
}

/* --- favourites ----------------------------------------------------------- */

export function isSaved(id) {
  return loadState().saved.includes(id);
}

export function toggleSaved(id) {
  return update((state) => {
    state.saved = state.saved.includes(id) ? state.saved.filter((item) => item !== id) : [id, ...state.saved];
  });
}

export function removeSaved(id) {
  return update((state) => {
    state.saved = state.saved.filter((item) => item !== id);
    state.shortlists = state.shortlists.map((list) => ({ ...list, items: list.items.filter((item) => item !== id) }));
  });
}

/* --- comparison ----------------------------------------------------------- */

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export function isCompared(id) {
  return loadState().compared.includes(id);
}

/** Returns { ok, reason } so the interface can explain a refusal. */
export function toggleCompared(id) {
  const state = loadState();
  if (state.compared.includes(id)) {
    update((next) => {
      next.compared = next.compared.filter((item) => item !== id);
    });
    return { ok: true, removed: true, count: loadState().compared.length };
  }
  if (state.compared.length >= COMPARE_MAX) {
    return { ok: false, reason: `You can compare up to ${COMPARE_MAX} homes. Remove one to add another.`, count: state.compared.length };
  }
  update((next) => {
    next.compared = [...next.compared, id];
  });
  return { ok: true, removed: false, count: loadState().compared.length };
}

export function clearCompared() {
  return update((state) => {
    state.compared = [];
  });
}

/* --- shortlists ----------------------------------------------------------- */

export function createShortlist(name) {
  const clean = String(name || '').trim().slice(0, 60) || 'Untitled shortlist';
  const list = { id: `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: clean, items: [] };
  update((state) => {
    state.shortlists = [...state.shortlists, list];
  });
  return list;
}

export function renameShortlist(id, name) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return null;
  update((state) => {
    state.shortlists = state.shortlists.map((list) => (list.id === id ? { ...list, name: clean } : list));
  });
  return clean;
}

export function deleteShortlist(id) {
  return update((state) => {
    state.shortlists = state.shortlists.filter((list) => list.id !== id);
  });
}

export function addToShortlist(listId, listingId) {
  return update((state) => {
    state.shortlists = state.shortlists.map((list) =>
      list.id === listId && !list.items.includes(listingId)
        ? { ...list, items: [...list.items, listingId] }
        : list);
  });
}

export function removeFromShortlist(listId, listingId) {
  return update((state) => {
    state.shortlists = state.shortlists.map((list) =>
      list.id === listId ? { ...list, items: list.items.filter((item) => item !== listingId) } : list);
  });
}

export function shortlistsContaining(listingId) {
  return loadState().shortlists.filter((list) => list.items.includes(listingId));
}

/* --- checklist ------------------------------------------------------------ */

export function isChecked(listingId, questionId) {
  return Boolean(loadState().questions?.[listingId]?.[questionId]);
}

export function setChecked(listingId, questionId, value) {
  return update((state) => {
    const forListing = { ...(state.questions[listingId] || {}) };
    if (value) forListing[questionId] = true;
    else delete forListing[questionId];
    state.questions = { ...state.questions, [listingId]: forListing };
  });
}

export function checkedCount(listingId) {
  return Object.keys(loadState().questions?.[listingId] || {}).length;
}

/* --- search memory -------------------------------------------------------- */

export function rememberSearch(term) {
  const clean = String(term || '').trim();
  if (clean.length < 2) return loadState().recentSearches;
  return update((state) => {
    state.recentSearches = [clean, ...state.recentSearches.filter((item) => item !== clean)].slice(0, 8);
  }).recentSearches;
}

export function rememberFilters(filters, sort) {
  return update((state) => {
    state.filters = filters;
    state.sort = sort;
  });
}
