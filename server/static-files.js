/**
 * Static file serving with an explicit allowlist.
 *
 * Only these top-level paths are ever served:
 *   index.html, css/, src/, assets/, docs/
 *
 * Everything else — server code, data, tests, tools, package.json, README, .env
 * — returns 404, which is what the acceptance checklist requires. Traversal is
 * refused after normalisation, and write methods are rejected.
 */
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

export const ALLOWED_PREFIXES = ['css/', 'src/', 'assets/', 'docs/'];
export const ALLOWED_FILES = ['index.html'];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml'
};

export function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Resolve a request path to an absolute file path within `root`, or null when
 * the path is not allowlisted or escapes the root.
 */
export function resolveStaticPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^\/+/, '');
  const normalised = path.posix.normalize(relative);
  if (normalised.startsWith('..') || path.isAbsolute(normalised)) return null;
  const isAllowedFile = ALLOWED_FILES.includes(normalised);
  const isAllowedPrefix = ALLOWED_PREFIXES.some((prefix) => normalised.startsWith(prefix));
  if (!isAllowedFile && !isAllowedPrefix) return null;
  const absolute = path.resolve(root, normalised);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== path.resolve(root, ALLOWED_FILES[0]) && !absolute.startsWith(rootWithSep)) return null;
  return absolute;
}

export async function serveStatic(req, res, { root, urlPath, hstsMaxAge = 0, securityHeaders }) {
  const filePath = resolveStaticPath(root, urlPath);
  if (!filePath) {
    logger.debug(`static refused: ${req.method} ${urlPath}`);
    return { status: 404, reason: 'not_allowlisted' };
  }
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    return { status: 404, reason: 'not_found' };
  }
  if (stats.isDirectory()) return { status: 404, reason: 'is_directory' };

  // Static assets are content-addressed by release: short cache, must revalidate.
  const headers = {
    'Content-Type': contentTypeFor(filePath),
    'Content-Length': stats.size,
    'Cache-Control': 'public, max-age=300, must-revalidate',
    ...securityHeaders({ hstsMaxAge })
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return { status: 200 };
  }
  await new Promise((resolve) => {
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      logger.error('static stream failed');
      res.destroy();
      resolve();
    });
    stream.on('end', resolve);
    stream.pipe(res);
  });
  return { status: 200 };
}

export function isWriteMethod(method) {
  return !['GET', 'HEAD'].includes(method || 'GET');
}
