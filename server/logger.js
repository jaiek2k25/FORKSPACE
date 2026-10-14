/**
 * Logger with a hard redaction rule: values of the named secret variables never
 * reach a log line, no matter what a caller passes in.
 */
const SECRET_ENV_NAMES = [
  'NVIDIA_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_API_KEY',
  'AUTHORISED_API_KEY',
  'API_KEY',
  'TOKEN',
  'SECRET'
];

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function collectSecretValues(env = process.env) {
  const values = new Set();
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== 'string' || value.length < 8) continue;
    const upper = name.toUpperCase();
    if (SECRET_ENV_NAMES.some((needle) => upper === needle || upper.endsWith(`_${needle}`) || upper.includes('API_KEY'))) {
      values.add(value);
    }
  }
  return values;
}

const secretValues = collectSecretValues();

/**
 * Key-shaped strings, so a secret is masked even when it did not come from a
 * named environment variable (for example, when it arrived inside an error
 * message built by an HTTP client).
 */
const SECRET_PATTERNS = [
  /\bnvapi-[A-Za-z0-9_\-]{6,}/g,
  /\bAIza[A-Za-z0-9_\-]{10,}/g,
  /\bsk-[A-Za-z0-9_\-]{12,}/g,
  /\bBearer\s+[A-Za-z0-9._\-]{8,}/gi,
  /([?&](?:key|api_key|apikey|access_token|token)=)[^&\s]+/gi
];

/** Replace every known secret with a fixed marker. Exported for tests. */
export function redact(text, extraValues = []) {
  let out = String(text);
  for (const value of [...secretValues, ...extraValues]) {
    if (typeof value === 'string' && value.length >= 6) out = out.split(value).join('[redacted]');
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix) => (prefix ? `${prefix}[redacted]` : '[redacted]'));
  }
  return out;
}

function write(level, message, meta) {
  const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
  if (LEVELS[level] < threshold) return;
  const stamp = new Date().toISOString();
  const suffix = meta === undefined ? '' : ` ${redact(typeof meta === 'string' ? meta : JSON.stringify(meta))}`;
  const line = `${stamp} ${level.toUpperCase()} ${redact(message)}${suffix}`;
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta)
};

export function secretCount() {
  return secretValues.size;
}
