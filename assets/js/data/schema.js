/**
 * Provider-independent listing schema.
 *
 * The same module is imported by the browser, by the server API and by the
 * adapters, so a record that fails validation fails everywhere for the same
 * reason. Field-by-field documentation lives in docs/LISTING_SCHEMA.md.
 */

export const SCHEMA_VERSION = '1.1.0';

export const SOURCE_KINDS = ['demo', 'api', 'feed', 'dataset', 'manual'];
export const LISTING_STATUSES = ['available', 'pending', 'let', 'withdrawn', 'sample', 'unknown'];
export const FEE_KINDS = ['known', 'estimate', 'unknown'];
export const FEE_FREQUENCIES = ['one-off', 'monthly', 'annual', 'weekly', 'unknown'];
export const PROPERTY_TYPES = ['apartment', 'house', 'studio', 'townhouse', 'loft', 'shared', 'room'];
export const FURNISHING_STATUSES = ['furnished', 'semi-furnished', 'unfurnished', 'unknown'];

export const STATUS_LABELS = Object.freeze({
  available: 'Available',
  pending: 'Under application',
  let: 'Let',
  withdrawn: 'Withdrawn',
  sample: 'Sample record',
  unknown: 'Status unknown'
});

/** Fields that must be present on a source block. */
export const REQUIRED_SOURCE_FIELDS = ['id', 'name', 'kind', 'attribution', 'licence'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate a `source` block.
 * Licensed-file and REST adapters call this and reject records that fail it:
 * a record without a named source, kind, attribution or licence is unusable.
 */
export function validateSource(source) {
  const errors = [];
  if (!isPlainObject(source)) return { ok: false, errors: ['source must be an object'] };
  for (const field of REQUIRED_SOURCE_FIELDS) {
    const value = source[field];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`source.${field} is required`);
    }
  }
  if (typeof source.kind === 'string' && !SOURCE_KINDS.includes(source.kind)) {
    errors.push(`source.kind must be one of: ${SOURCE_KINDS.join(', ')}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Validate a full listing record. Returns errors (fatal) and warnings (not fatal). */
export function validateListing(listing) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(listing)) return { ok: false, errors: ['listing must be an object'], warnings };

  const required = ['id', 'title', 'city', 'country', 'propertyType', 'status'];
  for (const field of required) {
    if (typeof listing[field] !== 'string' || listing[field].trim() === '') {
      errors.push(`${field} is required`);
    }
  }
  if (typeof listing.id === 'string' && !/^[a-z0-9][a-z0-9-]{1,63}$/.test(listing.id)) {
    errors.push('id must be lowercase alphanumeric with hyphens, 2–64 characters');
  }
  if (typeof listing.status === 'string' && !LISTING_STATUSES.includes(listing.status)) {
    errors.push(`status must be one of: ${LISTING_STATUSES.join(', ')}`);
  }
  if (typeof listing.propertyType === 'string' && !PROPERTY_TYPES.includes(listing.propertyType)) {
    warnings.push(`propertyType "${listing.propertyType}" is outside the known set`);
  }

  const source = validateSource(listing.source);
  errors.push(...source.errors);

  if (!isPlainObject(listing.rent)) {
    errors.push('rent is required');
  } else {
    if (!FEE_KINDS.includes(listing.rent.kind)) errors.push('rent.kind must be known, estimate or unknown');
    if (typeof listing.rent.currency !== 'string' || listing.rent.currency.length !== 3) {
      errors.push('rent.currency must be a 3-letter code');
    }
    const rentAmountPresent = listing.rent.amount !== null && listing.rent.amount !== undefined && listing.rent.amount !== '';
    if (listing.rent.kind === 'unknown' && rentAmountPresent) {
      warnings.push('rent.kind is "unknown" but an amount is present; the amount is ignored downstream');
    }
    if (listing.rent.kind !== 'unknown' && !(rentAmountPresent && Number.isFinite(Number(listing.rent.amount)))) {
      errors.push('rent.amount must be a number unless rent.kind is "unknown"');
    }
  }

  if (!Array.isArray(listing.fees)) {
    errors.push('fees must be an array (use an empty array when nothing is stated)');
  } else {
    listing.fees.forEach((fee, index) => {
      if (!isPlainObject(fee)) {
        errors.push(`fees[${index}] must be an object`);
        return;
      }
      if (typeof fee.label !== 'string' || !fee.label.trim()) errors.push(`fees[${index}].label is required`);
      if (!FEE_KINDS.includes(fee.kind)) errors.push(`fees[${index}].kind must be known, estimate or unknown`);
      if (!FEE_FREQUENCIES.includes(fee.frequency)) {
        errors.push(`fees[${index}].frequency must be one of: ${FEE_FREQUENCIES.join(', ')}`);
      }
      const feeAmountPresent = fee.amount !== null && fee.amount !== undefined && fee.amount !== '';
      if (fee.kind !== 'unknown' && !(feeAmountPresent && Number.isFinite(Number(fee.amount)))) {
        errors.push(`fees[${index}].amount is required unless kind is "unknown"`);
      }
      // Note: `Number(null)` is 0, so an explicit null check is required here.
      if (fee.kind === 'unknown' && feeAmountPresent && Number.isFinite(Number(fee.amount))) {
        errors.push(`fees[${index}] has an amount but is marked unknown; unknown fees must never carry a figure`);
      }
    });
  }

  if (!isPlainObject(listing.provenance)) {
    errors.push('provenance is required');
  } else {
    if (typeof listing.provenance.schemaVersion !== 'string') errors.push('provenance.schemaVersion is required');
    if (typeof listing.provenance.isDemo !== 'boolean') errors.push('provenance.isDemo must be a boolean');
  }

  if (!isPlainObject(listing.verification)) {
    errors.push('verification block is required (lastVerifiedAt may be null)');
  } else if (listing.verification.lastVerifiedAt !== null &&
             Number.isNaN(new Date(listing.verification.lastVerifiedAt).getTime())) {
    errors.push('verification.lastVerifiedAt must be null or an ISO date');
  }

  if (!Array.isArray(listing.amenities)) errors.push('amenities must be an array');

  // Demo records must never look verified or carry a source URL.
  if (listing.provenance?.isDemo) {
    if (listing.source?.url) errors.push('demo records must not carry a source URL');
    if (listing.verification?.lastVerifiedAt) errors.push('demo records must not carry a verification timestamp');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function assertValidListing(listing) {
  const result = validateListing(listing);
  if (!result.ok) {
    const error = new Error(`invalid listing: ${result.errors.join('; ')}`);
    error.validation = result;
    throw error;
  }
  return listing;
}
