/** Small text utilities shared by the client modules. */

export function timeToRead(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

export function truncate(value, max = 140) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function sentenceCase(value) {
  const text = String(value || '');
  if (!text) return '';
  return text[0].toUpperCase() + text.slice(1);
}

/** Deterministic, stable id hash used for demo raw-hash values. */
export function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
