/**
 * Resolve a Chromium binary for the browser test suite.
 *
 * Order of preference:
 *   1. CHROMIUM_PATH environment variable (any Chrome/Chromium build).
 *   2. A normal Playwright browser download (`npx playwright install chromium`).
 *   3. The npm-packaged Chromium used by serverless runtimes
 *      (`@sparticuz/chromium`), extracted to a local cache directory.
 *
 * Step 3 exists because some sandboxes can reach the npm registry but not the
 * Playwright browser CDN. It is a developer/tooling convenience only and is
 * never referenced by the application or by production code.
 *
 * `@sparticuz/chromium` is declared in devDependencies rather than installed by
 * hand, because an undeclared package is pruned by the next `npm install` and the
 * browser suite then fails with a bare "executable doesn't exist". It is a dev
 * dependency, so the production image and the Docker build never see it, and
 * anyone who prefers the normal route can still run `npx playwright install
 * chromium` and step 2 above will find it first.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const CACHE_DIR = path.join(os.tmpdir(), 'forkspace-chromium');

function fromEnv() {
  const p = process.env.CHROMIUM_PATH;
  return p && existsSync(p) ? { executablePath: p, env: {} } : null;
}

function fromPlaywrightInstall() {
  try {
    const registryPath = require('playwright-core/lib/server/registry/index.js');
    void registryPath;
  } catch { /* fall through */ }
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(process.env.HOME || os.homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) return null;
  for (const entry of ['chromium-1248', 'chromium-1200']) {
    const bin = path.join(cache, entry, 'chrome-linux', 'chrome');
    if (existsSync(bin)) return { executablePath: bin, env: {} };
  }
  return null;
}

function fromSparticuz() {
  let pkgDir;
  try {
    let dir = path.dirname(require.resolve('@sparticuz/chromium'));
    while (!existsSync(path.join(dir, 'bin', 'chromium.br'))) {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error('not found');
      dir = parent;
    }
    pkgDir = dir;
  } catch {
    return null;
  }
  const binDir = path.join(pkgDir, 'bin');
  const exe = path.join(CACHE_DIR, 'chromium');
  const libDir = path.join(CACHE_DIR, 'lib', 'lib');
  if (!existsSync(exe) || !existsSync(path.join(libDir, 'libnss3.so'))) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(exe, brotliDecompressSync(readFileSync(path.join(binDir, 'chromium.br'))));
    chmodSync(exe, 0o755);
    const tar = path.join(CACHE_DIR, 'libs.tar');
    writeFileSync(tar, brotliDecompressSync(readFileSync(path.join(binDir, 'al2023.tar.br'))));
    mkdirSync(path.join(CACHE_DIR, 'lib'), { recursive: true });
    execFileSync('tar', ['-xf', tar, '-C', path.join(CACHE_DIR, 'lib')]);
    rmSync(tar, { force: true });
  }
  return { executablePath: exe, env: { LD_LIBRARY_PATH: libDir } };
}

export function resolveChromium() {
  return fromEnv() || fromPlaywrightInstall() || fromSparticuz();
}

export function launchOptions(extra = {}) {
  const found = resolveChromium();
  return {
    executablePath: found ? found.executablePath : undefined,
    env: { ...process.env, ...(found ? found.env : {}) },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
    ...extra
  };
}
