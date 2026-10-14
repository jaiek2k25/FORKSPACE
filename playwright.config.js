/**
 * Playwright configuration for the browser suite.
 *
 * The suite starts its own server on an unused port so it never disturbs a
 * running development instance. Chromium comes from tools/local-chromium.mjs,
 * which prefers an installed browser, then CHROMIUM_PATH, then a packaged
 * build — see that file for why.
 */
import { defineConfig } from '@playwright/test';
import { launchOptions } from './tools/local-chromium.mjs';

const PORT = Number(process.env.BROWSER_TEST_PORT || 5199);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    launchOptions: launchOptions(),
    viewport: { width: 1280, height: 900 },
    trace: 'off',
    screenshot: 'off'
  },
  webServer: {
    command: `PORT=${PORT} NODE_ENV=test node server/index.js`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe'
  }
});
