/**
 * Minimal .env loader.
 *
 * Node 20 has no `--env-file-if-exists`, and we never want a missing file to be
 * fatal in development or in a container that receives configuration through
 * real environment variables.
 *
 * Rules:
 *   - A variable that already exists in the environment always wins.
 *   - Blank lines and lines starting with `#` are ignored.
 *   - Values may be quoted with single or double quotes.
 *   - Nothing is ever logged, returned or thrown with the value in it.
 */
import { existsSync, readFileSync } from 'node:fs';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parse .env text into a plain object. Exported for tests. */
export function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq < 1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!KEY_PATTERN.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1);
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/**
 * Load a .env file into `env` without overriding anything already set.
 * Returns the list of keys that were applied (names only, never values).
 */
export function loadEnvFile(filePath, env = process.env) {
  if (!filePath || !existsSync(filePath)) return [];
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const parsed = parseEnv(text);
  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] !== undefined && env[key] !== '') continue;
    env[key] = value;
    applied.push(key);
  }
  return applied;
}
