/**
 * Security headers. Applied to every response, including 404s and errors.
 *
 * The Content-Security-Policy is deliberately strict and allows nothing remote:
 * no inline scripts, no inline styles, no third-party fonts, no third-party
 * requests of any kind. The interface uses the system font stacks, so it renders
 * identically whether or not the machine has internet access.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests"
].join('; ');

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'camera=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'usb=()',
  'xr-spatial-tracking=()'
].join(', ');

/**
 * The single definition of the API cache policy. Anything that answers with a
 * JSON body must use this exact value, so a caching rule cannot drift between
 * the header helper and an individual route.
 */
export const CACHE_NO_STORE = 'no-store, no-cache, must-revalidate';

export function securityHeaders({ hstsMaxAge = 0, api = false } = {}) {
  const headers = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  };
  // Only under an explicit opt-in, because HSTS on a plain-HTTP host would
  // break the deployment it is meant to protect.
  if (hstsMaxAge > 0) {
    headers['Strict-Transport-Security'] = `max-age=${hstsMaxAge}; includeSubDomains`;
  }
  if (api) headers['Cache-Control'] = CACHE_NO_STORE;
  return headers;
}

export function applySecurityHeaders(res, options) {
  const headers = securityHeaders(options);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
}
