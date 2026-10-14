/**
 * Duplicate detection.
 *
 *   exact     same provider record id, or the same source URL
 *   probable  same city, area, property type and bedroom count, rent within
 *             ±2%, plus a title or address match
 *   possible  rent within ±5% (same city); reported but NEVER merged
 *
 * Nothing in this module mutates or removes a listing. It reports pairs so a
 * human can decide. Rents that are not stated are never compared.
 */
import { rentInInr } from './filters.js';

export const DUPLICATE_KINDS = Object.freeze(['exact', 'probable', 'possible']);

export function normaliseText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'and', 'with', 'for', 'to', 'on']);

export function significantTokens(value) {
  return normaliseText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/** Token overlap ratio between two strings, 0–1. */
export function similarity(a, b) {
  const left = new Set(significantTokens(a));
  const right = new Set(significantTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function withinPercent(a, b, percent) {
  if (a === null || b === null) return false;
  if (a === 0 || b === 0) return a === b;
  return Math.abs(a - b) / Math.max(a, b) <= percent / 100;
}

/**
 * Classify one pair.
 * @returns {{kind: 'exact'|'probable'|'possible'|null, reasons: string[]}}
 */
export function classifyPair(a, b) {
  const reasons = [];
  if (!a || !b || a.id === b.id) return { kind: null, reasons };

  const recordA = a.provenance?.providerRecordId;
  const recordB = b.provenance?.providerRecordId;
  if (recordA && recordB && recordA === recordB) {
    reasons.push(`Same provider record id (${recordA}).`);
    return { kind: 'exact', reasons };
  }
  const urlA = a.source?.url;
  const urlB = b.source?.url;
  if (urlA && urlB && urlA === urlB) {
    reasons.push('Identical source URL.');
    return { kind: 'exact', reasons };
  }

  const rentA = rentInInr(a);
  const rentB = rentInInr(b);
  const sameCity = a.cityId && b.cityId && a.cityId === b.cityId;
  const sameArea = normaliseText(a.area) === normaliseText(b.area) && normaliseText(a.area) !== '';
  const sameType = a.propertyType === b.propertyType;
  const sameBeds = a.bedrooms !== null && a.bedrooms === b.bedrooms;
  const titleMatch = similarity(a.title, b.title) >= 0.6;
  const addressMatch = similarity(a.address, b.address) >= 0.6;

  if (sameCity && sameArea && sameType && sameBeds && withinPercent(rentA, rentB, 2) && (titleMatch || addressMatch)) {
    reasons.push('Same city, area, property type and bedroom count.');
    reasons.push('Rents within 2%.');
    reasons.push(titleMatch ? 'Titles are similar.' : 'Addresses are similar.');
    return { kind: 'probable', reasons };
  }

  if (sameCity && withinPercent(rentA, rentB, 5)) {
    reasons.push('Same city with rents within 5% — review, but do not merge automatically.');
    return { kind: 'possible', reasons };
  }

  return { kind: null, reasons };
}

/** All reported pairs, grouped by kind. Nothing is merged. */
export function detectDuplicates(listings) {
  const groups = { exact: [], probable: [], possible: [] };
  for (let i = 0; i < listings.length; i += 1) {
    for (let j = i + 1; j < listings.length; j += 1) {
      const { kind, reasons } = classifyPair(listings[i], listings[j]);
      if (!kind) continue;
      groups[kind].push({ a: listings[i], b: listings[j], reasons });
    }
  }
  return groups;
}

export function duplicateSummary(listings) {
  const groups = detectDuplicates(listings);
  return {
    exact: groups.exact.length,
    probable: groups.probable.length,
    possible: groups.possible.length,
    groups,
    mergeable: groups.exact.length, // only exact matches would ever be merged, and only by hand
    reported: groups.probable.length + groups.possible.length
  };
}
