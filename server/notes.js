/**
 * Shared wording about money, so the server and the interface describe the
 * currency rules in the same words.
 */
import { FX_RATES_AS_OF, RATES_PER_INR } from '../assets/js/data/fx.js';

export const BUDGET_NOTE = Object.freeze({
  storageCurrency: 'INR',
  displayCurrency: 'converted for display through a static, illustrative table',
  rateDate: FX_RATES_AS_OF,
  rates: RATES_PER_INR,
  disclosure: 'Budget filters are stored in INR and converted for display with a static, illustrative FX table that ships with this build. It is not a live rate feed, and every converted figure is labelled as illustrative.'
});

export const UNKNOWN_FEE_RULE =
  'A fee marked unknown never carries an amount, is never converted, and is never added to any total.';
