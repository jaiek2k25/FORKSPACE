/**
 * FORKSPACE server.
 *
 * Plain Node http, no framework. Responsibilities:
 *   - serve the allowlisted static files
 *   - answer the JSON API
 *   - apply security headers to every response
 *   - validate configuration at start-up and refuse to start on a bad one
 *   - shut down gracefully on SIGTERM and SIGINT
 */
import http from 'node:http';
import { initConfig, describeConfig, VERSION } from './config.js';
import { logger } from './logger.js';
import { applySecurityHeaders } from './security.js';
import { serveStatic, isWriteMethod } from './static-files.js';
import { handleApi } from './api.js';
import { handleUnexpected, sendError, sendText, guardTimeouts } from './http-kit.js';
import { createLimiters, startRateLimitSweeper } from './rate-limit.js';
import { createAiAdapter } from './ai.js';
import { createGeocoder } from './geocode.js';
import { loadListings } from './listings-service.js';

export function createApp(config, { ai = createAiAdapter(config), geocoder = createGeocoder(config), limiters = createLimiters(config) } = {}) {
  // The only remote origin the browser may load from, and only when map tiles are
  // configured. Everything else in the policy stays 'self'.
  const tileOrigin = config.map?.enabled ? config.map.tileOrigin : '';
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      applySecurityHeaders(res, { hstsMaxAge: config.hstsMaxAge, api: false, tileOrigin });
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');

      if (isApi) {
        // API responses are never cached and never framed as documents.
        applySecurityHeaders(res, { hstsMaxAge: config.hstsMaxAge, api: true });
        await handleApi({ req, res, url, config, ai, geocoder, limiters });
      } else if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
        // Write methods never touch the file system.
        sendError(res, 405, 'method_not_allowed', 'This server serves static files read-only. Only GET and HEAD are allowed.');
      } else if (url.pathname === '/' || url.pathname === '/index.html') {
        // The shell is the only document, so it is the only response that may send
        // a referrer — and only the bare origin, which the tile policy requires.
        applySecurityHeaders(res, { hstsMaxAge: config.hstsMaxAge, tileOrigin, document: true });
        const result = await serveStatic(req, res, { root: config.root, urlPath: '/index.html', hstsMaxAge: config.hstsMaxAge, securityHeaders: () => ({}) });
        if (result.status !== 200 && !res.headersSent) sendError(res, 404, 'not_found', 'index.html is missing from this deployment.');
      } else {
        const result = await serveStatic(req, res, { root: config.root, urlPath: url.pathname, hstsMaxAge: config.hstsMaxAge, securityHeaders: () => ({}) });
        if (result.status === 404 && !res.headersSent) {
          // Unknown deep links get a short plain-text answer: this app is a
          // hash-routed single page, so a 404 here means a wrong file path.
          sendText(res, 404, 'Not found.\n');
        }
      }
    } catch (error) {
      handleUnexpected(res, error, 'request handler');
    } finally {
      if (config.nodeEnv !== 'test') {
        logger.debug(`${req.method} ${req.url} → ${res.statusCode} in ${Date.now() - started}ms`);
      }
    }
  });

  guardTimeouts(server, config.limits);
  return { server, ai, geocoder, limiters };
}

export function startServer(config) {
  const { server, limiters, geocoder } = createApp(config);
  const stopSweeper = startRateLimitSweeper(limiters);
  const geocodeSweeper = setInterval(() => geocoder.sweep(), 60 * 60 * 1000);
  geocodeSweeper.unref?.();

  server.listen(config.port, config.host, () => {
    logger.info(`listening on http://${config.host}:${config.port} (this log never contains configuration values)`);
  });

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} received: closing the server gracefully`);
    stopSweeper();
    clearInterval(geocodeSweeper);
    server.close(() => {
      logger.info('server closed');
      process.exit(0);
    });
    // Do not wait forever for in-flight sockets.
    setTimeout(() => {
      logger.warn('forcing exit after shutdown timeout');
      process.exit(0);
    }, 8000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { server, shutdown };
}

/** Boot: load .env, validate, warn, and only then listen. */
export async function main() {
  const result = initConfig();
  for (const line of describeConfig(result)) {
    if (line.startsWith('error:')) logger.error(line);
    else if (line.startsWith('warning:')) logger.warn(line);
    else logger.info(line);
  }
  if (result.errors.length > 0) {
    logger.error(`refusing to start: ${result.errors.length} configuration error(s). Fix them and try again. Values are never printed.`);
    process.exit(1);
  }
  // Warm the listing service so a broken dataset fails loudly at boot.
  await loadListings(result.config);
  startServer(result.config);
}

export { VERSION };

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((error) => {
    logger.error('fatal start-up error', error?.message || 'unknown error');
    process.exit(1);
  });
}
