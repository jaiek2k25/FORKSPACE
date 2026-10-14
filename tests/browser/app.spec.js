/**
 * Browser suite (Playwright + Chromium).
 *
 * These are the checks that need a real layout engine: horizontal overflow at
 * phone and tablet widths, accessibility violations from axe-core, and the
 * interactive behaviour a person would actually exercise.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const AXE_PATH = new URL('../../node_modules/axe-core/axe.min.js', import.meta.url).pathname;
const AXE_SOURCE = readFileSync(AXE_PATH, 'utf8');

const ROUTES = [
  { hash: '#/', name: 'home' },
  { hash: '#/search', name: 'search' },
  { hash: '#/search?view=map', name: 'search map view' },
  { hash: '#/property/lon-01', name: 'property (London, benchmark)' },
  { hash: '#/property/dxb-01', name: 'property (unknown rent)' },
  { hash: '#/compare?ids=lis-01,ber-01', name: 'compare (two)' },
  { hash: '#/compare?ids=coim-01,blr-01,lis-01,ber-01', name: 'compare (four)' },
  { hash: '#/research', name: 'research' },
  { hash: '#/saved', name: 'saved' },
  { hash: '#/sources', name: 'sources' }
];

const VIEWPORTS = [
  { name: 'mobile 390', width: 390, height: 844 },
  { name: 'tablet 820', width: 820, height: 1180 }
];

/**
 * Carry out an axe audit. The app ships a strict CSP that blocks inline script
 * on purpose, and axe has to be injected to run at all, so the policy is
 * bypassed for these checks only.
 */
async function audit(page) {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const outcome = await axe.run(document, { resultTypes: ['violations'] });
    return outcome.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 4).map((node) => node.target.join(' '))
    }));
  });
}

async function openRoute(page, hash) {
  await page.goto(`/${hash}`);
  await page.waitForSelector('#main > *');
  await page.waitForTimeout(250); // the search route shows a short loading state
}

test.describe('layout', () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`no horizontal overflow: ${route.name} at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openRoute(page, route.hash);
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const widest = [];
          for (const element of document.querySelectorAll('body *')) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.right > doc.clientWidth + 1) {
              widest.push({
                tag: element.tagName.toLowerCase(),
                className: typeof element.className === 'string' ? element.className.slice(0, 60) : '',
                right: Math.round(rect.right)
              });
            }
          }
          return {
            documentOverflow: doc.scrollWidth - doc.clientWidth,
            offenders: widest.slice(0, 5)
          };
        });
        expect(overflow.documentOverflow, `page scrolls sideways; offenders: ${JSON.stringify(overflow.offenders)}`).toBeLessThanOrEqual(1);
      });
    }
  }

  test('the container is centred at 1200px with 24px padding on a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRoute(page, '#/search');
    const metrics = await page.$eval('.site-header__inner', (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { maxWidth: style.maxWidth, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, left: Math.round(rect.left), width: Math.round(rect.width) };
    });
    expect(metrics.maxWidth).toBe('1200px');
    expect(metrics.paddingLeft).toBe('24px');
    expect(metrics.paddingRight).toBe('24px');
    expect(metrics.width).toBeLessThanOrEqual(1200);
    // Centred: the gap on the left is the same as on the right, within a pixel.
    const gap = await page.evaluate(() => {
      const rect = document.querySelector('.site-header__inner').getBoundingClientRect();
      return { left: Math.round(rect.left), right: Math.round(document.documentElement.clientWidth - rect.right) };
    });
    expect(Math.abs(gap.left - gap.right)).toBeLessThanOrEqual(1);
  });

  test('the action rows wrap rather than overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(page, '#/search');
    const wraps = await page.$eval('.card__actions', (node) => getComputedStyle(node).flexWrap);
    expect(wraps).toBe('wrap');
  });
});

test.describe('accessibility (axe-core)', () => {
  // axe is injected as a script, and the app's own CSP blocks inline script on
  // purpose, so the policy is relaxed for these checks only. The CSP itself is
  // asserted in the server suite and by the "no third-party request" check.
  test.use({ bypassCSP: true });

  for (const route of ROUTES) {
    test(`no violations: ${route.name}`, async ({ page }) => {
      await openRoute(page, route.hash);
      const results = await audit(page);
      expect(results, JSON.stringify(results, null, 2)).toEqual([]);
    });
  }

  test('no violations after running the research assistant on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoute(page, '#/research');
    await page.fill('#research-brief', 'two bedrooms in Berlin, furnished, under €2,500, must have a concierge');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.match');
    const results = await audit(page);
    expect(results, JSON.stringify(results, null, 2)).toEqual([]);
  });
});

test.describe('interactions', () => {
  test('the page loads with no console errors on any route', async ({ page }) => {
    const problems = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(String(error)));
    for (const route of ROUTES) await openRoute(page, route.hash);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('search: filtering, chips and reset all change the list visibly', async ({ page }) => {
    await openRoute(page, '#/search');
    const cards = page.locator('.results-grid .card');
    await expect(cards).toHaveCount(13);

    await page.getByRole('checkbox').first().check();
    await expect(page.locator('.chips .chip--removable')).toHaveCount(1);
    await expect.poll(async () => cards.count()).toBeLessThan(13);
    expect(page.url()).toContain('cities=');

    await page.locator('.chips .chip--removable').first().click();
    await expect.poll(async () => cards.count()).toBe(13);
    expect(page.url()).not.toContain('cities=');

    await page.locator('.checkbox', { hasText: 'Tokyo' }).locator('input').check();
    await expect.poll(async () => cards.count()).toBe(1);
    await page.getByRole('button', { name: 'Reset all' }).first().click();
    await expect.poll(async () => cards.count()).toBe(13);
    expect(page.url()).toMatch(/#\/search$/);
  });

  test('search: sorting reorders the results and is reflected in the URL', async ({ page }) => {
    await openRoute(page, '#/search');
    await page.locator('.card__title').first().waitFor();
    const before = await page.locator('.card__title').allInnerTexts();

    await page.selectOption('select[aria-label="Sort results"]', 'price-asc');
    await expect.poll(async () => page.url()).toContain('sort=price-asc');
    await expect.poll(async () => (await page.locator('.card__title').allInnerTexts()).join('|')).not.toBe(before.join('|'));
    const ascending = await page.locator('.card__title').allInnerTexts();
    expect(ascending.length).toBe(13);

    await page.selectOption('select[aria-label="Sort results"]', 'price-desc');
    await expect.poll(async () => (await page.locator('.card__title').allInnerTexts()).join('|')).not.toBe(ascending.join('|'));
  });

  test('saving and comparing from a card update the header and the comparison bar', async ({ page }) => {
    await openRoute(page, '#/search');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.waitForSelector('.results-grid .card');

    const heart = page.locator('.card').first().getByRole('button', { name: /save/i });
    await heart.click();
    await expect(page.locator('.site-nav__link', { hasText: 'Saved' }).locator('.site-nav__badge')).toHaveText('1');

    const toggles = page.locator('.compare-toggle input');
    await toggles.nth(0).check();
    await toggles.nth(1).check();
    await expect(page.locator('.compare-bar__title')).toContainText('2 of 4');

    const compareLink = page.locator('.compare-bar a').filter({ hasText: /compare/i });
    await expect(compareLink).toBeVisible();
    await compareLink.click();
    await page.waitForSelector('.compare-table');
    await expect(page.locator('.compare-table thead th')).toHaveCount(3);

    const diff = page.getByRole('button', { name: /differences/i });
    const rowsBefore = await page.locator('.compare-table tbody tr').count();
    await diff.click();
    await page.waitForTimeout(150);
    const rowsAfter = await page.locator('.compare-table tbody tr').count();
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
  });

  test('a named shortlist can be created and filled on the saved page', async ({ page }) => {
    await openRoute(page, '#/saved');
    await page.waitForSelector('#shortlist-name');
    await page.fill('#shortlist-name', 'Browser shortlist');
    await page.click('.shortlist-create button[type="submit"]');
    await expect(page.locator('.shortlist')).toHaveCount(1);
    await expect(page.locator('.shortlist__head input')).toHaveValue('Browser shortlist');

    const addSelect = page.locator('.shortlist select').first();
    const options = await addSelect.locator('option').count();
    if (options > 1) {
      const value = await addSelect.locator('option').nth(1).getAttribute('value');
      await addSelect.selectOption(value);
      await expect(page.locator('.shortlist__item')).toHaveCount(1);
    }
  });

  test('the checklist survives a reload', async ({ page }) => {
    await page.goto('/#/saved');
    await page.evaluate(() => window.localStorage.clear());
    await openRoute(page, '#/property/tor-01');
    const first = page.locator('.checklist input[type="checkbox"]').first();
    await first.check();
    await expect(page.locator('.checklist__count')).toContainText('1 of');
    await page.reload();
    await page.waitForSelector('.checklist');
    await expect(page.locator('.checklist input[type="checkbox"]').first()).toBeChecked();
  });

  test('the gallery is keyboard navigable and the counter follows', async ({ page }) => {
    await openRoute(page, '#/property/nyc-01');
    await expect(page.locator('.gallery__counter')).toHaveText(/Photo 1 of \d+/);
    await page.locator('.gallery').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.gallery__counter')).toHaveText(/Photo 2 of \d+/);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.gallery__counter')).toHaveText(/Photo 1 of \d+/);
    await expect(page.locator('.gallery__disclosure')).toHaveText('Illustrative photos · not of this specific home');
  });

  test('the research banner names the adapter and the model, and the report renders', async ({ page }) => {
    await openRoute(page, '#/research');
    const banner = page.locator('.adapter-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Adapter: mock');
    await expect(banner).toContainText('Model: none');
    await expect(banner).toContainText('does not search the internet');

    // A brief the sample dataset can satisfy: criteria, scores and evidence render.
    // Hard limits (city, rent, bedrooms) are reported in the requirements table and
    // in the exclusions, so the per-home list holds the remaining criteria.
    await page.fill('#research-brief', 'one bedroom in Tokyo under ¥250,000, furnished and walkable');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.criterion');
    const criteria = page.locator('.criterion');
    expect(await criteria.count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.match__score-value').first()).toHaveText(/\d+\/\d+/);
    const states = await criteria.evaluateAll((nodes) => nodes.map((node) => node.className));
    expect(states.some((cls) => cls.includes('criterion--met'))).toBeTruthy();
    expect(states.some((cls) => cls.includes('criterion--not_met'))).toBeTruthy();

    // A brief nothing can satisfy: the exclusion table must explain each home.
    await page.fill('#research-brief', 'three bedrooms in Tokyo');
    await page.click('button[type="submit"]');
    await expect(page.locator('.panel', { hasText: 'Excluded by a hard limit' })).toBeVisible();
    const reasons = page.locator('.data-table--exclusions tbody td');
    expect(await reasons.count()).toBe(13);
    for (const text of await reasons.allInnerTexts()) {
      expect(text.trim().length).toBeGreaterThan(10);
    }
  });

  test('a map is drawn for one city, with the credit visible and nothing plotted', async ({ page }) => {
    const external = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://127.0.0.1:')) external.push(url);
    });

    await openRoute(page, '#/search?view=map&cities=tokyo');

    // A real map, from the locally served Leaflet, centred on a real city centre.
    // Leaflet adds .leaflet-container to the element it is given, so the canvas is the container.
    await expect(page.locator('.map-frame__canvas.leaflet-container')).toBeVisible();
    await expect(page.locator('.map-frame__title')).toHaveText(/Map of Tokyo · nothing plotted/);
    await expect(page.locator('.map-frame')).toContainText('no home is plotted on it');

    // Attribution is on screen, not behind a toggle: the data requires it.
    const credit = page.locator('.leaflet-control-attribution');
    await expect(credit).toBeVisible();
    await expect(credit).toContainText('OpenStreetMap');
    // The credit links to the licence itself, not to a bare homepage.
    await expect(credit.locator('a[href*="openstreetmap.org/copyright"]')).toBeVisible();
    // Leaflet's own credit sits next to ours and is left in place.
    await expect(credit.locator('a[href*="leafletjs.com"]')).toBeVisible();

    // No fictional home is ever plotted, so there is no pin.
    expect(await page.locator('.map-pin').count()).toBe(0);

    // The only remote requests allowed in the whole application are map tiles,
    // and only to the one configured host.
    for (const url of external) {
      expect(url, `unexpected third-party request: ${url}`).toMatch(/^https:\/\/tile\.openstreetmap\.org\//);
    }
  });

  test('map tiles are only ever requested from the configured host, in the right shape', async ({ page }) => {
    const tiles = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://127.0.0.1:')) tiles.push(url);
    });
    await openRoute(page, '#/search?view=map&cities=lisbon');
    await page.waitForSelector('.map-frame__canvas.leaflet-container');
    await page.waitForTimeout(1200);

    expect(tiles.length).toBeGreaterThan(0);
    for (const url of tiles) {
      // The exact XYZ form the tile usage policy requires, at a real zoom level.
      expect(url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d{1,2}\/\d+\/\d+\.png$/);
    }
    // One host only, and a viewport's worth of tiles, not a download.
    expect(new Set(tiles.map((url) => new URL(url).origin))).toEqual(new Set(['https://tile.openstreetmap.org']));
    expect(tiles.length).toBeLessThanOrEqual(40);
  });

  test('tiles that cannot be reached are explained, and the credit stays visible', async ({ page }) => {
    // Deterministic in any environment: the tile host is made unreachable.
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await openRoute(page, '#/search?view=map&cities=berlin');
    await page.waitForSelector('.map-frame__canvas.leaflet-container');
    const warning = page.locator('.map-frame__warning');
    await expect(warning).toBeVisible({ timeout: 15000 });
    await expect(warning).toContainText('could not be loaded');
    await expect(warning).toContainText('tile.openstreetmap.org');
    await expect(warning).toContainText('Everything else on this page is unaffected');
    // The attribution is about the data, so it stays on screen either way.
    await expect(page.locator('.map-frame__credit')).toContainText('OpenStreetMap contributors');
  });

  test('no map, no remote request: the rest of the application stays offline', async ({ page }) => {
    const external = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://127.0.0.1:')) external.push(url);
    });
    for (const hash of ['#/', '#/search', '#/search?view=map', '#/property/lon-01', '#/compare?ids=lis-01,ber-01', '#/research', '#/saved', '#/sources']) {
      await openRoute(page, hash);
      if (hash !== '#/search?view=map') continue;
      // No city selected, so the map view offers the written explanation instead.
      await expect(page.locator('.map-placeholder')).toContainText('Choose one city to see a map');
      expect(await page.locator('.leaflet-container').count()).toBe(0, 'no canvas is created without a city to centre on');
    }
    // With no map drawn there is nothing remote to fetch: not a tile, not a font.
    expect(external, `third-party requests: ${external.join(', ')}`).toEqual([]);
  });

  test('a record with checked coordinates is plotted, with its source named', async ({ page }) => {
    /**
     * The demo dataset deliberately holds no coordinates, so the plotting path is
     * exercised with a record shaped the way licensed data will arrive. This is the
     * test that proves the map lights up when real data is connected — and that it
     * stays dark for every fictional record.
     */
    const upstream = await page.request.get('http://127.0.0.1:5199/api/listings');
    const payload = await upstream.json();
    const target = payload.listings.find((listing) => listing.id === 'ber-01');
    const fixture = {
      ...payload,
      listings: payload.listings.map((listing) => listing.id !== 'ber-01' ? listing : {
        ...listing,
        provenance: { ...listing.provenance, isDemo: false },
        source: { ...listing.source, url: 'https://example.test/records/ber-01' },
        coordinates: {
          lat: 52.4875,
          lng: 13.4244,
          source: 'the partner feed’s own geocoding (checked by the operator)',
          checkedAt: '2026-10-01',
          note: 'Rounded to four decimal places by the provider.'
        }
      })
    };
    expect(target).toBeTruthy();
    await page.route('**/api/listings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));

    const requests = [];
    page.on('request', (request) => requests.push(request.url()));

    await openRoute(page, '#/property/ber-01');
    await page.waitForSelector('.map-frame__canvas.leaflet-container');
    await expect(page.locator('.map-pin')).toHaveCount(1);
    await expect(page.locator('.panel', { hasText: 'Where it is' })).toContainText('coordinates supplied by');
    await expect(page.locator('.panel', { hasText: 'Where it is' })).toContainText('1 October 2026');
    await expect(page.locator('.map-frame__credit')).toContainText('OpenStreetMap contributors');

    // Every remote request is a tile from the configured host, nothing else.
    for (const url of requests.filter((entry) => !entry.startsWith('http://127.0.0.1:'))) {
      expect(url).toMatch(/^https:\/\/tile\.openstreetmap\.org\//);
    }
  });

  test('the API answers are used, and the served page holds no secrets', async ({ page }) => {
    const responses = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/')) responses.push({ url: response.url(), status: response.status() });
    });
    await openRoute(page, '#/search');
    await openRoute(page, '#/sources');
    expect(responses.some((entry) => entry.url.endsWith('/api/listings') && entry.status === 200)).toBeTruthy();
    const html = await page.content();
    expect(html).not.toMatch(/nvapi-|AIzaSy/);
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.every((key) => key === 'forkspace.v1'), `unexpected storage keys: ${keys.join(', ')}`).toBeTruthy();
  });
});
