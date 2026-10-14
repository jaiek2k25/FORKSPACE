/**
 * Security headers. Applied to every response, including 404s and errors.
 *
 * The Content-Security-Policy is deliberately strict and allows nothing remote:
 * no inline scripts, no inline styles, no third-party fonts, no third-party
 * requests of any kind. The interface uses the system font stacks, so it renders
 * identically whether or not the machine has internet access.
 */
/**
 * The policy allows exactly one remote origin, and only when an operator has
 * configured map tiles: the single host in `img-src`, for map images. No remote
 * scripts, styles, fonts, frames or fetches are ever permitted, so a compromised
 * tile response cannot execute anything in this application.
 */
export function contentSecurityPolicy({ tileOrigin = '' } = {}) {
  const images = ["'self'", 'data:'];
  if (tileOrigin) images.push(tileOrigin);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    `img-src ${images.join(' ')}`,
    "connect-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
}

/** The policy with no map tiles configured. */
const CSP = contentSecurityPolicy();

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

export function securityHeaders({ hstsMaxAge = 0, api = false, tileOrigin = '', document = false } = {}) {
  const headers = {
    'Content-Security-Policy': contentSecurityPolicy({ tileOrigin }),
    'X-Content-Type-Options': 'nosniff',
    /**
     * Documents are the only responses that carry a referrer policy loose enough
     * to send one. The tile usage policy requires a Referer header on tile
     * requests, and `strict-origin-when-cross-origin` sends the bare origin and
     * nothing else: no path, no query, no fragment. Every other response — API
     * payloads, images, scripts, styles — sends no referrer at all, and when no
     * map tiles are configured a document sends none either.
     */
    'Referrer-Policy': document && tileOrigin ? 'strict-origin-when-cross-origin' : 'no-referrer',
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
