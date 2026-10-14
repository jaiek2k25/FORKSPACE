/**
 * Static, illustrative FX table.
 *
 * FORKSPACE does not call a rates API. Every conversion in this app uses the
 * table below, which is hard-coded, dated and labelled in the interface
 * wherever a converted figure appears. Rates are expressed per 1 INR.
 */
export const FX_RATES_AS_OF = '2026-10-01';
export const FX_SOURCE = 'Illustrative static table shipped with the demo build';

/** Units of each currency per 1 INR. */
export const RATES_PER_INR = Object.freeze({
  INR: 1,
  USD: 0.0115,
  EUR: 0.0092,
  GBP: 0.0079,
  CAD: 0.0151,
  AUD: 0.0168,
  JPY: 0.175,
  AED: 0.0424,
  MXN: 0.1985
});

/** Locale used to display each currency when a listing does not state one. */
export const DEFAULT_LOCALE_FOR = Object.freeze({
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  CAD: 'en-CA',
  AUD: 'en-AU',
  JPY: 'ja-JP',
  AED: 'en-AE',
  MXN: 'es-MX'
});

export const CURRENCIES = Object.keys(RATES_PER_INR);

export function isSupportedCurrency(code) {
  return Object.prototype.hasOwnProperty.call(RATES_PER_INR, code);
}

/** Convert a minor amount between currencies through the INR table. */
export function convert(amount, from, to) {
  if (!Number.isFinite(amount)) return null;
  if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) return null;
  const inInr = amount / RATES_PER_INR[from];
  return inInr * RATES_PER_INR[to];
}

export function toInr(amount, from) {
  return convert(amount, from, 'INR');
}

export function fromInr(amountInr, to) {
  return convert(amountInr, 'INR', to);
}

/**
 * Approximate FX note shown next to converted figures.
 * Always makes clear that the number is a converted illustration.
 */
export function fxNote(from, to) {
  if (from === to) return `Same currency (${from}); no conversion applied.`;
  const rate = RATES_PER_INR[to] / RATES_PER_INR[from];
  const formatted = new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 3 }).format(rate);
  return `Converted from ${from} to ${to} at 1 ${from} ≈ ${formatted} ${to} using the illustrative static FX table (rate date ${FX_RATES_AS_OF}). Illustrative only — not a live rate.`;
}
