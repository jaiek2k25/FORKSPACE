/**
 * Saved homes and shortlists.
 *
 * Everything here lives in localStorage under one versioned key. There is no
 * account and nothing is uploaded. When storage is unavailable the page says so
 * rather than pretending a save worked.
 */
import { el, fragment, replace } from '../lib/dom.js';
import { icon } from '../components/icons.js';
import { listingCard, sampleBadge, statusBadge, rentLine } from '../components/cards.js';
import { LISTINGS } from '../data/listings.js';
import {
  loadState, toggleSaved, removeSaved, createShortlist, renameShortlist, deleteShortlist,
  addToShortlist, removeFromShortlist, clearCompared, resetState, storageAvailable, STORAGE_KEY
} from '../lib/store.js';
import { compareHref } from '../lib/compare-actions.js';
import { COMPARE_MAX } from '../lib/store.js';

function shortlistCard(shortlist, byId, ctx) {
  const items = shortlist.items.map((id) => byId.get(id)).filter(Boolean);
  const nameInput = el('input', {
    class: 'input input--compact',
    type: 'text',
    value: shortlist.name,
    maxlength: '60',
    'aria-label': `Rename ${shortlist.name}`,
    onChange: (event) => {
      renameShortlist(shortlist.id, event.target.value);
      ctx.onStoreChange?.();
      ctx.rerender();
    }
  });

  const addSelect = el('select', {
    class: 'input input--compact',
    'aria-label': `Add a saved home to ${shortlist.name}`,
    onChange: (event) => {
      if (!event.target.value) return;
      addToShortlist(shortlist.id, event.target.value);
      ctx.onStoreChange?.();
      ctx.rerender();
    }
  },
    el('option', { value: '' }, 'Add a saved home…'),
    ...ctx.savedListings
      .filter((listing) => !shortlist.items.includes(listing.id))
      .map((listing) => el('option', { value: listing.id }, `${listing.title} (${listing.city})`))
  );

  return el('article', { class: 'shortlist' },
    el('div', { class: 'shortlist__head' },
      nameInput,
      el('div', { class: 'shortlist__actions' },
        addSelect,
        items.length >= 2
          ? el('a', { class: 'button button--primary button--small', href: compareHref(items.slice(0, COMPARE_MAX).map((listing) => listing.id)) }, `Compare ${Math.min(items.length, COMPARE_MAX)}`)
          : el('span', { class: 'button button--primary button--small is-disabled', 'aria-disabled': 'true' }, 'Compare'),
        el('button', {
          type: 'button',
          class: 'button button--quiet button--small',
          onClick: () => {
            deleteShortlist(shortlist.id);
            ctx.onStoreChange?.();
            ctx.rerender();
          }
        }, icon('close', 14), 'Delete list')
      )
    ),
    items.length
      ? el('ul', { class: 'shortlist__items' }, ...items.map((listing) => el('li', { class: 'shortlist__item' },
          el('div', { class: 'shortlist__item-main' },
            el('a', { class: 'shortlist__item-title', href: `#/property/${listing.id}` }, listing.title),
            el('p', { class: 'shortlist__item-meta' }, `${listing.area} · ${listing.city}`),
            rentLine(listing, { compact: true })
          ),
          el('div', { class: 'shortlist__item-actions' },
            el('a', { class: 'button button--quiet button--small', href: `#/property/${listing.id}` }, 'Open'),
            el('button', {
              type: 'button',
              class: 'button button--quiet button--small',
              onClick: () => {
                removeFromShortlist(shortlist.id, listing.id);
                ctx.onStoreChange?.();
                ctx.rerender();
              }
            }, 'Remove from list')
          )
        )))
      : el('p', { class: 'muted' }, 'No homes in this shortlist yet. Save a home, then add it here.')
  );
}

export function renderSaved({ navigate, data, onStoreChange, notify }) {
  const byId = new Map((data.listings?.length ? data.listings : LISTINGS).map((listing) => [listing.id, listing]));
  const page = el('div', { class: 'saved' });
  let pendingName = '';

  function rerender() {
    const state = loadState();
    const savedListings = state.saved.map((id) => byId.get(id)).filter(Boolean);
    const compared = state.compared.map((id) => byId.get(id)).filter(Boolean);

    const createForm = el('form', { class: 'shortlist-create', onSubmit: (event) => {
      event.preventDefault();
      if (!nameInput.value.trim()) {
        notify?.('Give the shortlist a name first.', 'warn');
        return;
      }
      createShortlist(nameInput.value);
      pendingName = '';
      nameInput.value = '';
      onStoreChange?.();
      rerender();
    } },
      el('label', { class: 'field__label', for: 'shortlist-name' }, 'Create a named shortlist'),
      el('div', { class: 'shortlist-create__row' },
        nameInput,
        el('button', { type: 'submit', class: 'button button--primary' }, icon('plus', 15), 'Create shortlist')
      )
    );

    replace(page, 
      el('header', { class: 'page-head' },
        el('p', { class: 'page-head__eyebrow' }, 'Saved'),
        el('h1', { class: 'page-head__title' }, 'Saved homes and shortlists'),
        el('p', { class: 'page-head__lede' }, `Kept in this browser under the key “${STORAGE_KEY}”. Nothing is uploaded, there is no account, and clearing your browser data clears this list.`),
        storageAvailable
          ? null
          : el('p', { class: 'warn-note' }, 'This browser is blocking local storage, so saves will not survive a reload. Everything else on the page still works.')
      ),

      el('section', { class: 'panel' },
        el('div', { class: 'panel__head' },
          el('h2', { class: 'panel__title' }, `Saved homes (${savedListings.length})`),
          savedListings.length
            ? el('div', { class: 'toolbar' },
                el('button', {
                  type: 'button',
                  class: 'button button--quiet button--small',
                  onClick: () => {
                    resetState();
                    onStoreChange?.();
                    notify?.('Saved homes and shortlists cleared from this device.', 'info');
                    rerender();
                  }
                }, 'Clear everything on this device')
              )
            : null
        ),
        savedListings.length
          ? fragment(
              el('div', { class: 'results-grid results-grid--compact' }, ...savedListings.map((listing) => listingCard(listing, {
                compareCount: state.compared.length,
                onStoreChange: () => { onStoreChange?.(); rerender(); }
              }))),
              el('div', { class: 'saved__compare-row' },
                el('p', { class: 'muted' }, `${state.compared.length} of ${COMPARE_MAX} selected for comparison.`),
                el('div', { class: 'saved__compare-actions' },
                  state.compared.length ? el('button', {
                    type: 'button',
                    class: 'button button--quiet button--small',
                    onClick: () => { clearCompared(); onStoreChange?.(); rerender(); }
                  }, 'Clear comparison selection') : null,
                  state.compared.length >= 2
                    ? el('a', { class: 'button button--primary button--small', href: compareHref(state.compared) }, `Compare selected (${state.compared.length})`)
                    : el('span', { class: 'button button--primary button--small is-disabled', 'aria-disabled': 'true' }, 'Compare selected')
                )
              )
            )
          : el('div', { class: 'state state--inline' },
              el('p', { class: 'state__text' }, 'No homes saved yet. Use the heart button on any card or property page.'),
              el('div', { class: 'cta-row' },
                el('a', { class: 'button button--primary', href: '#/search' }, 'Browse sample homes'),
                el('a', { class: 'button button--ghost', href: '#/research' }, 'Or describe what you want')
              )
            )
      ),

      el('section', { class: 'panel' },
        el('div', { class: 'panel__head' },
          el('h2', { class: 'panel__title' }, `Shortlists (${state.shortlists.length})`),
          el('p', { class: 'panel__text' }, 'Group saved homes into named lists — for example “shortlist for March” or “needs a second viewing”.')
        ),
        createForm,
        state.shortlists.length
          ? el('div', { class: 'shortlists' }, ...state.shortlists.map((shortlist) =>
              shortlistCard(shortlist, byId, {
                savedListings,
                onStoreChange,
                rerender
              })))
          : el('p', { class: 'muted' }, 'No shortlists yet.')
      ),

      compared.length
        ? el('section', { class: 'panel' },
            el('h2', { class: 'panel__title' }, 'Selected for comparison'),
            el('ul', { class: 'bullet-list' }, ...compared.map((listing) => el('li', null,
              el('a', { href: `#/property/${listing.id}` }, listing.title),
              ` — ${listing.area}, ${listing.city} `,
              sampleBadge(listing),
              ' ',
              statusBadge(listing)
            ))),
            el('a', { class: 'button button--primary', href: compareHref(state.compared) }, icon('columns', 16), 'Open comparison')
          )
        : null
    );
  }

  const nameInput = el('input', {
    class: 'input input--compact',
    id: 'shortlist-name',
    type: 'text',
    maxlength: '60',
    placeholder: 'For example: north-side options',
    value: pendingName,
    onInput: (event) => { pendingName = event.target.value; }
  });

  rerender();
  return page;
}
