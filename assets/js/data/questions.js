/**
 * "Questions to ask before committing" — the same checklist on every property
 * page, with per-listing extras appended when the record raises something
 * specific. Ticks are stored on the device only.
 */
export const CORE_QUESTIONS = [
  { id: 'rent-included', text: 'What exactly is included in the rent, and what is billed separately?' },
  { id: 'total-move-in', text: 'What is the total amount due before move-in, and what is refundable?' },
  { id: 'unknown-fees', text: 'Which of the fees marked unknown in this page has the landlord not confirmed in writing?' },
  { id: 'deposit-scheme', text: 'How is the deposit protected, in which scheme, and how do I get it back?' },
  { id: 'rent-review', text: 'How and when can the rent be increased, and how much notice is given?' },
  { id: 'notice-period', text: 'What is the notice period on both sides, and does the lease renew automatically?' },
  { id: 'repairs', text: 'Who is responsible for repairs, and what is the process and response time?' },
  { id: 'utilities', text: 'What do the last tenants actually paid per month for energy, water and internet?' },
  { id: 'viewing', text: 'Can I view the home in person or on a live video call before paying anything?' },
  { id: 'writing', text: 'Can every promise made in the viewing be confirmed in the lease before I sign?' }
];

/** Extra questions raised by a specific record. */
export function listingQuestions(listing) {
  if (!listing) return [];
  const extras = [];
  if (listing.rent?.kind === 'estimate') {
    extras.push({ id: 'estimated-rent', text: 'The rent shown is an estimate rather than a quoted figure. What rent is actually being asked?' });
  }
  if (listing.rent?.kind === 'unknown') {
    extras.push({ id: 'unknown-rent', text: 'No rent is stated anywhere in the record. What is the asking rent, and is it negotiable?' });
  }
  if (listing.fees?.some((fee) => fee.kind === 'unknown')) {
    const labels = listing.fees.filter((fee) => fee.kind === 'unknown').map((fee) => fee.label).join(', ');
    extras.push({ id: 'unknown-fee-list', text: `These costs are unknown: ${labels}. Can each one be put in writing before I commit?` });
  }
  if (listing.leaseMonths === 0 || listing.leaseMonths === null) {
    extras.push({ id: 'open-ended', text: 'The record does not state a minimum term. Is the lease fixed or open-ended?' });
  }
  if (listing.status === 'pending') {
    extras.push({ id: 'pending-status', text: 'This home is under application. Is it still worth viewing, and what is the backup position?' });
  }
  if (listing.status === 'let' || listing.status === 'withdrawn') {
    extras.push({ id: 'unavailable', text: 'This listing is no longer available. Is there a similar unit in the same building?' });
  }
  if ((listing.missing || []).length) {
    extras.push({ id: 'missing-topics', text: `The record is silent on: ${listing.missing.slice(0, 3).join('; ')}. Which of these can be answered now?` });
  }
  return extras;
}

export function allQuestions(listing) {
  return [...CORE_QUESTIONS, ...listingQuestions(listing)];
}

export function questionCount(listing) {
  return allQuestions(listing).length;
}
