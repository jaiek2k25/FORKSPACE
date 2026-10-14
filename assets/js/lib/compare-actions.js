/**
 * Small mutation helpers for the comparison selection.
 *
 * They live here rather than in store.js so that the store keeps one job:
 * owning the persisted shape.
 */
import { loadState, saveState } from './store.js';

export function addToCompare(id) {
  const state = loadState();
  if (state.compared.includes(id)) return state.compared;
  if (state.compared.length >= 4) return state.compared;
  return saveState({ ...state, compared: [...state.compared, id] }).compared;
}

export function removeFromCompare(id) {
  const state = loadState();
  return saveState({ ...state, compared: state.compared.filter((item) => item !== id) }).compared;
}

export function compareHref(ids) {
  return `#/compare?ids=${ids.map(encodeURIComponent).join(',')}`;
}
