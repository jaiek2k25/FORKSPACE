/**
 * Cost model.
 *
 * Hard rules, enforced here and asserted in the tests:
 *   - Every money row carries a kind: known | estimate | unknown.
 *   - Unknown rows never carry an amount and are never added to any total.
 *   - Totals are returned as known + estimates separately, so the interface can
 *     show "known" and "includes estimates" without mixing the two.
 *   - A currency conversion never happens silently: callers pass a target
 *     currency and receive the original amount and currency alongside.
 */

export const COST_KINDS = Object.freeze(['known', 'estimate', 'unknown']);

function emptyBucket(currency) {
  return {
    currency,
    known: [],
    estimates: [],
    unknown: [],
    knownTotal: 0,
    estimateTotal: 0,
    unknownCount: 0
  };
}

function addToBucket(bucket, row) {
  if (row.kind === 'known') {
    bucket.known.push(row);
    bucket.knownTotal += row.amount;
  } else if (row.kind === 'estimate') {
    bucket.estimates.push(row);
    bucket.estimateTotal += row.amount;
  } else {
    bucket.unknown.push(row);
    bucket.unknownCount += 1;
  }
}

/** Every row in the listing, normalised, without totals. */
export function costRows(listing) {
  const currency = listing?.rent?.currency || 'INR';
  const rows = [];
  rows.push({
    id: 'rent',
    label: 'Rent',
    amount: listing?.rent?.kind === 'unknown' ? null : Number(listing?.rent?.amount),
    currency,
    kind: listing?.rent?.kind || 'unknown',
    frequency: 'monthly',
    note: listing?.rent?.note || null,
    source: 'rent'
  });
  for (const [index, fee] of (listing?.fees || []).entries()) {
    rows.push({
      id: `fee-${index}`,
      label: fee.label,
      amount: fee.kind === 'unknown' ? null : Number(fee.amount),
      currency: fee.currency || currency,
      kind: fee.kind,
      frequency: fee.frequency,
      note: fee.note || null,
      source: 'fee'
    });
  }
  return rows;
}

/**
 * Split the listing's money into upfront (one-off) and recurring buckets.
 * @returns {{currency: string, upfront: object, monthly: object, annual: object, rent: object, caveats: string[]}}
 */
export function buildCostBreakdown(listing) {
  const currency = listing?.rent?.currency || 'INR';
  const upfront = emptyBucket(currency);
  const monthly = emptyBucket(currency);
  const annual = emptyBucket(currency);
  const caveats = [];

  for (const row of costRows(listing)) {
    if (row.kind === 'unknown') {
      // Unknown rows are recorded (so they can be shown) but never added anywhere.
      if (row.frequency === 'monthly') addToBucket(monthly, row);
      else if (row.frequency === 'annual') addToBucket(annual, row);
      else addToBucket(upfront, row);
      continue;
    }
    if (row.frequency === 'monthly') addToBucket(monthly, row);
    else if (row.frequency === 'annual') addToBucket(annual, row);
    else addToBucket(upfront, row);
  }

  if (listing?.rent?.kind === 'unknown') {
    caveats.push('The rent itself is not stated, so no monthly or upfront total can be computed.');
  }
  if (monthly.unknownCount > 0) {
    caveats.push(`${monthly.unknownCount} recurring cost${monthly.unknownCount === 1 ? ' is' : 's are'} unknown and deliberately excluded from every total.`);
  }
  if (upfront.unknownCount > 0) {
    caveats.push(`${upfront.unknownCount} upfront cost${upfront.unknownCount === 1 ? ' is' : 's are'} unknown and deliberately excluded from every total.`);
  }
  if (monthly.estimateTotal > 0) {
    caveats.push('Monthly totals include estimated rows, which are marked as estimates in the table below.');
  }
  if (listing?.deposit?.months !== undefined && listing?.deposit?.months !== null) {
    caveats.push(`The source describes a deposit of ${listing.deposit.months} month(s); the deposit line in the table is the amount actually stated, so the two are not added together.`);
  }

  return {
    currency,
    rent: {
      amount: listing?.rent?.kind === 'unknown' ? null : Number(listing?.rent?.amount),
      currency,
      kind: listing?.rent?.kind || 'unknown',
      note: listing?.rent?.note || null
    },
    upfront,
    monthly,
    annual,
    caveats
  };
}

/** Values used for the comparison table: totals are known-only plus a clearly marked estimate part. */
export function costSummary(listing) {
  const breakdown = buildCostBreakdown(listing);
  const upfrontCombined = breakdown.upfront.knownTotal + breakdown.upfront.estimateTotal;
  const monthlyCombined = breakdown.monthly.knownTotal + breakdown.monthly.estimateTotal;
  return {
    currency: breakdown.currency,
    upfrontKnown: breakdown.upfront.knownTotal,
    upfrontEstimates: breakdown.upfront.estimateTotal,
    upfrontCombined: breakdown.upfront.knownTotal > 0 || breakdown.upfront.estimateTotal > 0 ? upfrontCombined : null,
    monthlyKnown: breakdown.monthly.knownTotal,
    monthlyEstimates: breakdown.monthly.estimateTotal,
    monthlyCombined: breakdown.monthly.knownTotal > 0 || breakdown.monthly.estimateTotal > 0 ? monthlyCombined : null,
    unknownUpfront: breakdown.upfront.unknownCount,
    unknownMonthly: breakdown.monthly.unknownCount,
    monthlyTotalsAreIncomplete: breakdown.monthly.unknownCount > 0 || breakdown.rent.kind === 'unknown'
  };
}

/** Human-readable total, always stating whether estimates are included. */
export function describeTotal(knownTotal, estimateTotal, currency, formatMoney) {
  if (knownTotal === 0 && estimateTotal === 0) return 'No amount stated';
  const known = formatMoney(knownTotal, currency);
  if (estimateTotal === 0) return `${known} known`;
  return `${known} known + ${formatMoney(estimateTotal, currency)} in marked estimates`;
}
