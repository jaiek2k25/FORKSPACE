/**
 * Freshness rules — one implementation, used by the search cards, the property
 * page, the sources page and the tests.
 *
 *   fresh        verified 7 days ago or less
 *   aging        verified 8–30 days ago
 *   stale        verified more than 30 days ago
 *   unavailable  the listing is let or withdrawn (the timestamp is irrelevant)
 *   sample       demo data (never presentable as verified)
 *   unverified   no timestamp at all
 *
 * Rule of language: the word "Verified" is printed only when a verification
 * timestamp exists. Otherwise the record is "Stated, not verified", and demo
 * records are "Sample data · not verified".
 */
import { daysBetween, relativeDays } from '../data/format.js';

export const FRESHNESS = Object.freeze({
  FRESH: 'fresh',
  AGING: 'aging',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
  SAMPLE: 'sample',
  UNVERIFIED: 'unverified'
});

export const FRESHNESS_LABELS = Object.freeze({
  fresh: 'Fresh',
  aging: 'Aging',
  stale: 'Stale',
  unavailable: 'Unavailable',
  sample: 'Sample',
  unverified: 'Unverified'
});

export const FRESH_LIMIT_DAYS = 7;
export const AGING_LIMIT_DAYS = 30;

/**
 * @param {{status?: string, verification?: {lastVerifiedAt?: string|null}, provenance?: {isDemo?: boolean}}} record
 * @returns {{key: string, label: string, days: number|null, explanation: string, verified: boolean}}
 */
export function freshnessOf(record, now = Date.now()) {
  const status = record?.status || 'unknown';
  const isDemo = Boolean(record?.provenance?.isDemo) || status === 'sample';
  const lastVerifiedAt = record?.verification?.lastVerifiedAt || null;

  // A fictional record is "Sample data · not verified" whatever status it
  // carries. Its availability is shown separately as a status badge, so a
  // visitor never reads a demo record as something somebody checked.
  if (isDemo) {
    return {
      key: FRESHNESS.SAMPLE,
      label: FRESHNESS_LABELS.sample,
      days: null,
      verified: false,
      explanation: 'Sample data · not verified. This home is fictional and no one has checked it.'
    };
  }

  if (status === 'let' || status === 'withdrawn') {
    return {
      key: FRESHNESS.UNAVAILABLE,
      label: FRESHNESS_LABELS.unavailable,
      days: daysBetween(lastVerifiedAt, now),
      verified: Boolean(lastVerifiedAt),
      explanation: status === 'let'
        ? 'Already let, so freshness does not apply.'
        : 'Withdrawn from the market, so freshness does not apply.'
    };
  }

  if (lastVerifiedAt) {
    const days = daysBetween(lastVerifiedAt, now);
    if (days <= FRESH_LIMIT_DAYS) {
      return { key: FRESHNESS.FRESH, label: FRESHNESS_LABELS.fresh, days, verified: true, explanation: `Verified ${relativeDays(lastVerifiedAt, now)}.` };
    }
    if (days <= AGING_LIMIT_DAYS) {
      return { key: FRESHNESS.AGING, label: FRESHNESS_LABELS.aging, days, verified: true, explanation: `Verified ${relativeDays(lastVerifiedAt, now)} — worth re-checking before you rely on it.` };
    }
    return { key: FRESHNESS.STALE, label: FRESHNESS_LABELS.stale, days, verified: true, explanation: `Verified ${relativeDays(lastVerifiedAt, now)} — treat the details as out of date until re-checked.` };
  }

  return {
    key: FRESHNESS.UNVERIFIED,
    label: FRESHNESS_LABELS.unverified,
    days: null,
    verified: false,
    explanation: 'Stated, not verified. The source gave no verification timestamp.'
  };
}

/**
 * The single line shown next to a record: verified (with method), stated but
 * unverified, or sample data.
 */
export function verificationLine(record, now = Date.now()) {
  const freshness = freshnessOf(record, now);
  const method = record?.verification?.method;
  if (freshness.verified) {
    const methodText = method && method !== 'none' ? ` · method: ${method}` : '';
    return `${freshness.label} · ${freshness.explanation.replace(/\.$/, '')}${methodText}`;
  }
  if (freshness.key === FRESHNESS.SAMPLE) return 'Sample data · not verified';
  if (freshness.key === FRESHNESS.UNAVAILABLE) return `${freshness.label} · ${freshness.explanation.replace(/\.$/, '')}`;
  return 'Stated, not verified';
}

/** Freshness of a data source row on the sources page. */
export function sourceFreshness(source, now = Date.now()) {
  if (source?.kind === 'demo' || source?.state === 'sample') {
    return { key: FRESHNESS.SAMPLE, label: 'Sample', explanation: 'Demo data · not verified.', checkedAt: null };
  }
  if (!source?.lastCheckedAt) {
    return { key: FRESHNESS.UNVERIFIED, label: 'Unverified', explanation: 'No check has been recorded for this source.', checkedAt: null };
  }
  const days = daysBetween(source.lastCheckedAt, now);
  if (days <= FRESH_LIMIT_DAYS) return { key: FRESHNESS.FRESH, label: 'Fresh', explanation: `Checked ${relativeDays(source.lastCheckedAt, now)}.`, checkedAt: source.lastCheckedAt, days };
  if (days <= AGING_LIMIT_DAYS) return { key: FRESHNESS.AGING, label: 'Aging', explanation: `Checked ${relativeDays(source.lastCheckedAt, now)}.`, checkedAt: source.lastCheckedAt, days };
  return { key: FRESHNESS.STALE, label: 'Stale', explanation: `Checked ${relativeDays(source.lastCheckedAt, now)} — re-check before relying on it.`, checkedAt: source.lastCheckedAt, days };
}
