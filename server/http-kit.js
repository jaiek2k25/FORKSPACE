/**
 * Tiny HTTP helpers: body reading with a hard limit, JSON responses, and a
 * request-timeout guard. Plain Node http only.
 */
import { logger } from './logger.js';

export const JSON_TYPE = 'application/json; charset=utf-8';

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'Content-Type': JSON_TYPE,
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  if (res.req?.method === 'HEAD') res.end();
  else res.end(body);
}

export function sendError(res, status, code, message, details = undefined, extraHeaders = {}) {
  const payload = { error: { code, message } };
  if (details !== undefined) payload.error.details = details;
  sendJson(res, status, payload, extraHeaders);
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

/**
 * Read a request body with a byte cap.
 * @returns {Promise<{ok: true, text: string} | {ok: false, code: string, status: number}>}
 */
export function readBody(req, limitBytes) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      resolve(result);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        // Stop buffering, but keep draining the socket: destroying the request
        // here would make the client see a connection error instead of a clean
        // 413, and a clear answer matters more than a fast cut-off.
        req.removeListener('data', onData);
        req.resume();
        chunks.length = 0;
        finish({ ok: false, code: 'body_too_large', status: 413 });
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => finish({ ok: false, code: 'body_read_error', status: 400 }));
    req.on('aborted', () => finish({ ok: false, code: 'request_aborted', status: 400 }));
  });
}

export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Attach headers/request timeouts. A stalled client is closed rather than
 * allowed to hold a socket forever.
 */
export function guardTimeouts(server, { headersTimeoutMs, requestTimeoutMs }) {
  server.headersTimeout = headersTimeoutMs;
  server.requestTimeout = requestTimeoutMs;
  server.keepAliveTimeout = 5000;
}

/** Log a handled error without leaking internals to the client. */
export function handleUnexpected(res, error, context) {
  logger.error(`unhandled error in ${context}`, error?.message || 'unknown error');
  if (!res.headersSent) sendError(res, 500, 'internal_error', 'The server could not complete this request.');
  else res.end();
}

export function methodNotAllowed(res, allowed) {
  sendError(res, 405, 'method_not_allowed', `Use ${allowed.join(' or ')} for this endpoint.`);
}
