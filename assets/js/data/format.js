/**
 * Formatting helpers.
 *
 * Every money value carries a `kind` (known | estimate | unknown) and a
 * currency. These helpers format the number; the interface is responsible for
 * printing the label, and nothing here ever invents a figure.
 */
import { DEFAULT_LOCALE_FOR } from './fx.js';

export const UNKNOWN_TEXT = 'Not stated in the listing';

const formatterCache = new Map();

function formatter(locale, currency, options = {}) {
  const key = `${locale}|${currency}|${JSON.stringify(options)}`;
  let found = formatterCache.get(key);
  if (!found) {
    found = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: options.maximumFractionDigits ?? 0,
      minimumFractionDigits: options.minimumFractionDigits ?? 0
    });
    formatterCache.set(key, found);
  }
  return found;
}

/**
 * Format a rent or fee in the listing's own currency and locale.
 * @returns {string} the formatted amount, or an explicit unknown marker.
 */
export function formatMoney(amount, currency, locale = DEFAULT_LOCALE_FOR[currency] || 'en-GB') {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) {
    return UNKNOWN_TEXT;
  }
  try {
    return formatter(locale, currency).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toLocaleString('en-GB')}`;
  }
}

export function formatNumber(value, locale = 'en-GB') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return UNKNOWN_TEXT;
  return new Intl.NumberFormat(locale).format(Number(value));
}

/** "1 bed · 2 beds" style, used on cards and in tables. */
export function pluralise(count, singular, plural = `${singular}s`) {
  if (count === null || count === undefined) return `Not stated`;
  if (count === 0) return `Studio`;
  return `${count} ${count === 1 ? singular : plural}`;
}

export function frequencyLabel(frequency) {
  switch (frequency) {
    case 'one-off': return 'one-off';
    case 'monthly': return 'per month';
    case 'annual': return 'per year';
    case 'weekly': return 'per week';
    default: return 'frequency not stated';
  }
}

export function kindLabel(kind) {
  switch (kind) {
    case 'known': return 'Known';
    case 'estimate': return 'Estimate';
    default: return 'Unknown';
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const DATETIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
});

export function formatDate(iso) {
  if (!iso) return UNKNOWN_TEXT;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN_TEXT;
  return DATE_FORMAT.format(date);
}

export function formatDateTime(iso) {
  if (!iso) return UNKNOWN_TEXT;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNKNOWN_TEXT;
  return `${DATETIME_FORMAT.format(date)} UTC`;
}

/** "3 days ago", "today", "5 months ago" — coarse on purpose. */
export function relativeDays(iso, now = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export function daysBetween(iso, now = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / 86_400_000);
}

export function titleCase(value) {
  if (!value) return '';
  return String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
