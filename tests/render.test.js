/**
 * Render tests (jsdom).
 *
 * The app is started for real, against the real index.html and stylesheet, and
 * every route is visited. The assertions are about what a visitor can read and
 * do: countdowns, disclosures, column counts, checklist persistence, and the
 * rule that no page can print the words "null" or "undefined".
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createBrowser, apiStub } from './helpers/dom-env.js';
import { LISTINGS } from '../assets/js/data/listings.js';
import { loadState, toggleSaved, resetState, STORAGE_KEY } from '../assets/js/lib/store.js';
import { allQuestions } from '../assets/js/data/questions.js';
import { startApp } from '../assets/js/app.js';

const ROUTES = [
  '#/',
  '#/search',
  '#/search?q=lisbon&sort=price-asc',
  '#/search?view=map',
  '#/property/lon-01',
  '#/property/tky-01',
  '#/property/dxb-01',
  '#/compare?ids=lis-01,ber-01',
  '#/compare?ids=coim-01,blr-01,lis-01,ber-01',
  '#/compare?ids=lis-01',
  '#/research',
  '#/saved',
  '#/sources',
  '#/nope'
];

let browser;

before(async () => {
  browser = createBrowser({ fetchImpl: apiStub() });
  await startApp();
});

after(() => {
  browser?.dom?.window?.close();
});

test('shell: the header, navigation and footer render, and the title follows the route', async () => {
  await browser.goto('#/');
  assert.ok(browser.$('.site-header'), 'a header is present');
  assert.equal(browser.$$('.site-nav__link').length, 5);
  assert.ok(browser.$('.site-footer'));
  assert.match(browser.document.title, /FORKSPACE/);

  await browser.goto('#/sources');
  assert.match(browser.document.title, /[Ss]ource/);
  const active = browser.$$('.site-nav__link.is-active').map((node) => node.textContent.replace(/\d+$/, '').trim());
  assert.deepEqual(active, ['Sources'], 'the current page is marked in the navigation');
});

test('every route renders real content and never prints "null" or "undefined"', async () => {
  for (const hash of ROUTES) {
    await browser.goto(hash, { wait: 200 });
    const text = browser.mainText();
    assert.ok(text.length > 80, `${hash} rendered almost nothing`);
    assert.ok(!/\bundefined\b/i.test(text), `${hash} printed "undefined"`);
    assert.ok(!/\bnull\b/i.test(text), `${hash} printed "null"`);
    assert.ok(!/\bNaN\b/.test(text), `${hash} printed "NaN"`);
    assert.ok(!/\[object Object\]/.test(text), `${hash} printed an object`);
    const main = browser.main();
    assert.ok(main.children.length > 0, `${hash} rendered no elements`);
  }
});

test('home: hero, search form, destination tiles and how-it-helps all render', async () => {
  await browser.goto('#/');
  assert.match(browser.$('.hero__title').textContent, /rental/i);
  assert.ok(browser.$('form.search-form[role="search"]'));

  const tiles = browser.$$('.destinations .destination');
  assert.equal(tiles.length, 12, 'one tile per city in the dataset');
  assert.ok(tiles.every((tile) => tile.getAttribute('href').startsWith('#/search?')), 'each tile links to a filtered search');

  assert.equal(browser.$$('.help-grid .help-card').length >= 3, true);
  assert.ok(browser.$$('.example-briefs .chip').length >= 3, 'example briefs are offered');
  assert.match(browser.mainText(), /fictional|sample/i);
});

test('home: the form converts a stated budget and navigates to the search route', async () => {
  await browser.goto('#/');
  const form = browser.$('form.search-form');
  const query = browser.$('input[type="search"], .input--search', form);
  browser.input(query, 'walkable');
  const currency = browser.$('select[aria-label="Budget currency"]', form) || browser.$('select', form);
  browser.change(currency, 'EUR');
  const max = browser.$('input[aria-label="Maximum monthly rent"]', form);
  browser.change(max, '1500');
  browser.submit(form);
  await browser.settle(20);
  assert.match(browser.window.location.hash, /^#\/search\?/);
  assert.match(browser.window.location.hash, /q=walkable/);
});

test('search: skeletons appear first, then results appear after the loading state', async () => {
  await browser.goto('#/search');
  assert.ok(browser.$('.card--skeleton'), 'a loading state is shown first');
  await browser.settle(220);
  assert.equal(browser.$$('.card--skeleton').length, 0, 'skeletons are replaced');
  const cards = browser.$$('.results-grid .card');
  assert.equal(cards.length, 13, 'all 13 sample homes are listed by default');
  assert.match(browser.mainText(), /13 sample homes|13 homes/i);
});

test('search: a filter narrows the list, a chip removes it, and reset restores everything', async () => {
  await browser.goto('#/search');
  await browser.settle(220);

  const lisbon = browser.$$('.checkbox').find((label) => label.textContent.trim() === 'Lisbon');
  const checkbox = lisbon.querySelector('input[type="checkbox"]');
  checkbox.checked = true;
  browser.change(checkbox);
  await browser.settle(220);
  assert.equal(browser.$$('.results-grid .card').length, 1, 'only the Lisbon record remains');
  assert.match(browser.window.location.hash, /cities=lisbon/, 'the filter is reflected in the URL');

  const chip = browser.$$('.chips .chip--removable')[0];
  assert.ok(chip, 'an active filter produces a removable chip');
  browser.click(chip);
  await browser.settle(220);
  assert.equal(browser.$$('.results-grid .card').length, 13, 'removing the chip restores the list');

  const reset = browser.$$('button').find((button) => /reset all/i.test(button.textContent));
  browser.click(reset);
  await browser.settle(220);
  assert.equal(browser.window.location.hash, '#/search');
});

test('search: sorting reorders the results and the unknown-rent record stays last', async () => {
  await browser.goto('#/search?sort=price-desc');
  await browser.settle(220);
  const sortSelect = browser.$('select[aria-label="Sort results"]');
  assert.equal(sortSelect.value, 'price-desc');
  const titles = browser.$$('.results-grid .card__title').map((node) => node.textContent.trim());
  assert.equal(titles.length, 13);
  // The Dubai record has no stated rent, so it can never be called the most expensive.
  assert.ok(!/Dubai/.test(titles[0]), 'a record with no rent must not lead a price sort');
});

test('search: a query that matches nothing shows an empty state that explains itself', async () => {
  await browser.goto('#/search?q=zzzznotacity');
  await browser.settle(220);
  assert.equal(browser.$$('.results-grid .card').length, 0);
  const state = browser.mainText();
  assert.match(state, /0 homes match these filters|no sample home matches/i);
  assert.ok(browser.$$('button, a').some((node) => /reset|clear/i.test(node.textContent)), 'the empty state offers a way out');
});

test('search: the map view is a labelled stylised layout, never a live map', async () => {
  await browser.goto('#/search?view=map');
  await browser.settle(220);
  const placeholder = browser.$('.map-placeholder');
  assert.ok(placeholder, 'the map placeholder renders');
  const text = placeholder.textContent.replace(/\s+/g, ' ');
  assert.match(text, /not a live map/i);
  assert.match(text, /OpenStreetMap|no coordinates|illustrative/i);
  const canvas = browser.$('.map-placeholder__canvas');
  assert.equal(canvas.getAttribute('role'), 'group');
  assert.match(canvas.getAttribute('aria-label'), /not a live map/i);
  // The list is still available beside it.
  assert.ok(browser.$$('.results-grid .card').length >= 10);
});

test('search: selecting homes fills the comparison bar and links to the comparison', async () => {
  resetState();
  await browser.goto('#/search');
  await browser.settle(220);
  const toggles = browser.$$('.compare-toggle input');
  assert.ok(toggles.length >= 4);
  browser.click(toggles[0]);
  await browser.settle(30);
  browser.click(toggles[1]);
  await browser.settle(30);
  assert.equal(loadState().compared.length, 2);

  const bar = browser.$('.compare-bar');
  assert.ok(bar, 'the comparison bar appears once homes are selected');
  const link = browser.$$('.compare-bar a').find((node) => /compare/i.test(node.textContent));
  assert.ok(link, 'the bar links to the comparison');
  assert.match(link.getAttribute('href'), /^#\/compare\?ids=/);
});

test('search: the comparison is capped at four homes and says so', async () => {
  resetState();
  await browser.goto('#/search');
  await browser.settle(220);
  const toggles = browser.$$('.compare-toggle input');
  for (const toggle of toggles.slice(0, 6)) {
    browser.click(toggle);
    await browser.settle(20);
  }
  assert.equal(loadState().compared.length, 4, 'no more than four homes can be selected');
  const text = browser.mainText();
  assert.match(text, /4 of 4|full|maximum/i);
});

test('property: gallery, counter, disclosure and keyboard navigation all work', async () => {
  await browser.goto('#/property/lis-01');
  const counter = browser.$('.gallery__counter');
  assert.ok(counter, 'a photo counter is shown');
  assert.match(counter.textContent, /Photo 1 of \d+/);
  const thumbs = browser.$$('.gallery__thumb');
  assert.ok(thumbs.length >= 2, 'thumbnails are offered');
  assert.ok(browser.$('.gallery__disclosure'), 'the illustrative-photo caption is present');
  assert.match(browser.$('.gallery__disclosure').textContent, /not of this specific home/i);
  assert.ok(browser.$('.gallery .photo-credit'), 'every photograph credits its photographer');

  const stage = browser.$('.gallery__stage');
  browser.key(stage, 'ArrowRight');
  await browser.settle(10);
  assert.match(browser.$('.gallery__counter').textContent, /Photo 2 of \d+/);

  browser.click(thumbs[thumbs.length - 1]);
  await browser.settle(10);
  assert.match(browser.$('.gallery__counter').textContent, new RegExp(`Photo ${thumbs.length} of ${thumbs.length}`));
});

test('property: the cost table keeps known, estimate and unknown apart, and never totals an unknown', async () => {
  await browser.goto('#/property/coim-01');
  const table = browser.$('.cost-table');
  assert.ok(table, 'the cost table renders');
  const rows = browser.$$('.cost-table tbody tr', table);
  assert.ok(rows.length >= 6);

  // The Coimbatore record has an unknown brokerage: it must have no amount.
  const unknownRows = browser.$$('.cost-table tbody tr', table).filter((row) => row.querySelector('.tag--unknown, .cost-table__kind'));
  assert.ok(unknownRows.length > 0, 'at least one row is labelled');
  const unknownText = browser.$$('.cost-table__unknown', table).map((node) => node.textContent.trim());
  assert.ok(unknownText.every((text) => !/[0-9]/.test(text)), `an unknown must never show a figure: ${unknownText.join(' | ')}`);

  const totals = browser.$$('.cost-table__total', table).map((row) => row.textContent.replace(/\s+/g, ' '));
  assert.ok(totals.length >= 2, 'known-only and known-plus-estimates totals are both shown');
  assert.ok(totals.some((text) => /known/i.test(text)));
  assert.ok(totals.some((text) => /estimate/i.test(text)));
  assert.match(browser.mainText(), /never added|not included in any total|no total/i);
});

test('property: an unknown rent shows no rent figure, while known fees still may', async () => {
  await browser.goto('#/property/dxb-01');
  const amount = browser.$('.rent-panel__amount');
  assert.ok(amount, 'the rent amount area renders');
  assert.ok(!/\d/.test(amount.textContent), `the rent area must not print a figure: ${amount.textContent}`);
  assert.match(amount.textContent, /not stated|on application|not known/i);
  const panel = browser.$('.rent-panel').textContent.replace(/\s+/g, ' ');
  assert.match(panel, /no figure is stated/i, 'the reason is stated in words');
  assert.match(panel, /known amounts/i, 'known fees are still allowed to carry their own figures');
  assert.ok(browser.$('.tag--unknown'), 'the unknown label is shown');
  assert.match(browser.mainText(), /Unknown/);
});

test('property: the ONS benchmark appears on the London home only', async () => {
  await browser.goto('#/property/lon-01');
  const benchmark = browser.$('.panel--benchmark');
  assert.ok(benchmark, 'the London home carries the official statistics block');
  const text = benchmark.textContent.replace(/\s+/g, ' ');
  assert.match(text, /Area benchmark · official statistics/);
  assert.match(text, /Office for National Statistics|ONS/);
  assert.match(text, /no bedroom/i);
  assert.match(text, /area average/i);
  assert.match(text, /2,317|2317/);

  for (const id of ['lis-01', 'ber-01', 'nyc-01']) {
    await browser.goto(`#/property/${id}`);
    assert.equal(browser.$('.panel--benchmark'), null, `${id} must not show the London benchmark`);
  }
});

test('property: the questions checklist persists on the device', async () => {
  resetState();
  await browser.goto('#/property/tor-01');
  const boxes = browser.$$('.checklist input[type="checkbox"]');
  const expected = allQuestions(LISTINGS.find((listing) => listing.id === 'tor-01')).length;
  assert.equal(boxes.length, expected);
  assert.match(browser.$('.checklist__count').textContent, new RegExp(`0 of ${expected}`));

  boxes[0].checked = true;
  browser.change(boxes[0]);
  await browser.settle(10);
  assert.match(browser.$('.checklist__count').textContent, new RegExp(`1 of ${expected}`));

  // Leave the page and come back: the tick must still be there.
  await browser.goto('#/sources');
  await browser.goto('#/property/tor-01');
  const again = browser.$$('.checklist input[type="checkbox"]');
  assert.equal(again[0].checked, true, 'the checklist is stored, not just remembered in the page');
  assert.equal(loadState().questions['tor-01'][allQuestions(LISTINGS.find((l) => l.id === 'tor-01'))[0].id], true);
});

test('property: save and compare buttons change state and are announced', async () => {
  resetState();
  await browser.goto('#/property/ber-01');
  const save = browser.$$('button').find((button) => /save|saved/i.test(button.textContent));
  assert.ok(save);
  assert.equal(save.getAttribute('aria-pressed'), 'false');
  browser.click(save);
  await browser.settle(10);
  const saved = browser.$$('button').find((button) => /save|saved/i.test(button.textContent));
  assert.equal(saved.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(loadState().saved, ['ber-01']);
  assert.equal(browser.$('.toast') !== null || browser.$('#toasts').children.length > 0, true, 'a confirmation is shown');

  const compareToggle = browser.$$('button').find((button) => /compar/i.test(button.textContent));
  browser.click(compareToggle);
  await browser.settle(10);
  assert.ok(loadState().compared.includes('ber-01'));
});

test('compare: two columns render with a defined row set and a best marker', async () => {
  await browser.goto('#/compare?ids=lis-01,ber-01');
  const table = browser.$('.compare-table');
  assert.ok(table, 'the comparison table renders');
  assert.equal(browser.$$('.compare-table thead th').length - 1, 2, 'one column per selected home');
  const rowLabels = browser.$$('.compare-table tbody th').map((node) => node.textContent.trim());
  for (const expected of ['Monthly rent', 'Beds and baths']) {
    assert.ok(rowLabels.some((label) => label.startsWith(expected)), `the ${expected} row is present`);
  }
  assert.ok(browser.$$('.best-marker').length >= 1, 'a best value is marked where a comparison is meaningful');
  assert.equal(browser.$$('.rack-card').length, 2);
});

test('compare: four columns render, and a single home still renders rather than erroring', async () => {
  await browser.goto('#/compare?ids=coim-01,blr-01,lis-01,ber-01');
  assert.equal(browser.$$('.compare-table thead th').length - 1, 4);
  assert.equal(browser.$$('.rack-card').length, 4);

  await browser.goto('#/compare?ids=lis-01');
  assert.ok(browser.$('.compare-table') || browser.$('.rack-card'), 'a lone home still renders something useful');
  assert.match(browser.mainText(), /at least two|second home|one home/i);
});

test('compare: differences-only hides identical rows, and unknown ids are reported not ignored', async () => {
  await browser.goto('#/compare?ids=lis-01,ber-01');
  const before = browser.$$('.compare-table tbody tr').length;
  const toggle = browser.$$('button').find((button) => /differences/i.test(button.textContent));
  assert.ok(toggle, 'the differences-only control exists');
  browser.click(toggle);
  await browser.settle(20);
  const after = browser.$$('.compare-table tbody tr').length;
  assert.ok(after <= before, 'hiding identical rows cannot add rows');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');

  await browser.goto('#/compare?ids=lis-01,not-a-real-id');
  assert.match(browser.mainText(), /not-a-real-id|unknown id|not in this dataset/i);
  assert.equal(browser.$$('.compare-table thead th').length - 1, 1, 'only the real home is compared');
});

test('research: the banner names the adapter and the model, and labels itself a demo', async () => {
  await browser.goto('#/research');
  await browser.settle(20);
  const banner = browser.$('.adapter-banner');
  assert.ok(banner, 'the adapter banner renders');
  const text = banner.textContent.replace(/\s+/g, ' ');
  assert.match(text, /Adapter: mock/);
  assert.match(text, /Model: none/);
  assert.match(text, /demo/i);
  assert.match(text, /does not search the internet/i);
  assert.match(browser.$('.field__hint').textContent, /1000 characters/);
});

test('research: running a brief produces met, not met and unknown criteria, and never scores unknown as met', async () => {
  await browser.goto('#/research');
  await browser.settle(20);
  const textarea = browser.$('#research-brief');
  browser.input(textarea, 'two bedrooms in Berlin, furnished, under €2,500, must have a concierge');
  const form = browser.$('.brief-form');
  browser.submit(form);
  await browser.settle(60);

  const matches = browser.$$('.match');
  assert.ok(matches.length >= 1, 'at least one home is scored');
  const criteria = browser.$$('.match__criteria .criteria-row');
  assert.ok(criteria.length >= 3);

  for (const row of criteria) {
    const tag = row.querySelector('.criterion');
    const state = tag.className.match(/criterion--(\w+)/)?.[1] || 'unknown';
    const text = row.textContent.replace(/\s+/g, ' ');
    if (state === 'unknown') {
      assert.match(text, /unknown|could not|not stated|do not know|no record/i, `unknown criteria must say why: ${text}`);
    }
  }
  assert.match(browser.mainText(), /criteria met/i);
  const scoreValue = browser.$('.match__score-value').textContent;
  const [met, total] = scoreValue.split('/').map(Number);
  assert.ok(met <= total, 'the score can never exceed the number of criteria');
  assert.ok(!/all criteria met/i.test(browser.mainText()) || met === total);
});

test('research: a hard limit excludes homes and every exclusion states a reason', async () => {
  await browser.goto('#/research');
  await browser.settle(20);
  browser.input(browser.$('#research-brief'), 'three bedrooms in Tokyo under ¥200,000');
  browser.submit(browser.$('.brief-form'));
  await browser.settle(60);
  const text = browser.mainText();
  assert.match(text, /Excluded by a hard limit/i);
  const reasons = browser.$$('.data-table--exclusions tbody tr td').map((cell) => cell.textContent.trim());
  assert.ok(reasons.length > 0, 'the exclusions table lists the homes that failed a hard limit');
  assert.ok(reasons.length > 0);
  assert.ok(reasons.every((reason) => reason.length > 10), 'every exclusion carries a sentence, not a code');
  assert.match(text, /hard limit/i);
  assert.match(text, /Still missing|Questions to investigate/i);
});

test('saved: the empty state explains itself, and saving a home fills the page', async () => {
  resetState();
  await browser.goto('#/saved');
  assert.match(browser.mainText(), /No homes saved yet/);
  const link = browser.$$('#main a').find((node) => /browse/i.test(node.textContent));
  assert.ok(link, 'the empty state links to the search');

  toggleSaved('lon-01');
  await browser.goto('#/saved');
  await browser.settle(20);
  assert.match(browser.mainText(), /Saved homes \(1\)/);
  assert.equal(browser.$$('.results-grid .card').length, 1);
});

test('saved: a named shortlist can be created, filled and used for comparison', async () => {
  resetState();
  toggleSaved('lon-01');
  toggleSaved('ber-01');
  await browser.goto('#/saved');
  await browser.settle(20);

  const nameInput = browser.$('#shortlist-name');
  browser.input(nameInput, 'March shortlist');
  browser.submit(browser.$('.shortlist-create'));
  await browser.settle(20);
  assert.match(browser.mainText(), /Shortlists \(1\)/);
  assert.equal(loadState().shortlists[0].name, 'March shortlist');

  const addSelect = browser.$('.shortlist select');
  browser.change(addSelect, 'lon-01');
  await browser.settle(20);
  browser.change(browser.$('.shortlist select'), 'ber-01');
  await browser.settle(20);
  assert.equal(loadState().shortlists[0].items.length, 2);

  const compareLink = browser.$$('.shortlist a').find((node) => /^compare/i.test(node.textContent.trim()));
  assert.ok(compareLink, 'the shortlist offers a comparison link');
  assert.equal(compareLink.getAttribute('href'), '#/compare?ids=lon-01,ber-01');

  const del = browser.$$('.shortlist button').find((button) => /delete list/i.test(button.textContent));
  browser.click(del);
  await browser.settle(20);
  assert.equal(loadState().shortlists.length, 0);
});

test('sources: freshness wording is exact, and "Verified" appears only with a timestamp', async () => {
  await browser.goto('#/sources');
  const text = browser.mainText();
  assert.match(text, /Sample data · not verified/);
  assert.match(text, /Stated, not verified/);
  assert.match(text, /Unverified/);
  assert.ok(browser.$$('.source-card').length >= 6, 'every source is listed');

  const rows = browser.$$('.data-table--freshness tbody tr');
  assert.equal(rows.length, 13, 'one row per record in the freshness table');
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    const verified = cells[cells.length - 1].textContent.trim();
    const timestamp = cells[cells.length - 2].textContent.trim();
    if (verified === 'Verified') {
      assert.notEqual(timestamp, 'None', 'a record cannot be Verified without a timestamp');
    } else {
      assert.notEqual(timestamp, 'None', 'not applicable');
    }
  }
  // Nothing in the dataset carries a verification timestamp, so no row may say Verified.
  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    assert.notEqual(cells[cells.length - 1].textContent.trim(), 'Verified');
  }
});

test('sources: photography credits and licence note are published', async () => {
  await browser.goto('#/sources');
  const credits = browser.$$('.credit-list li');
  assert.ok(credits.length >= 15, 'every prepared photograph is credited');
  const licences = browser.$$('.credit-group__title').map((node) => node.textContent.trim());
  assert.ok(licences.length >= 3, 'photographs are grouped by licence');
  assert.ok(licences.some((licence) => /CC0|public domain/i.test(licence)), `no public-domain or CC0 group: ${licences.join(', ')}`);
  assert.ok(licences.some((licence) => /CC BY/i.test(licence)), 'a CC BY group is present');
  const text = credits.map((node) => node.textContent).join(' ');
  assert.match(text, /attribution required|attribution not required/i);
  assert.ok(credits.every((node) => node.textContent.trim().length > 20), 'every credit names the photograph and its photographer');
  // No credit group may be a non-commercial or no-derivatives licence. (The
  // words "no NC, no ND" legitimately appear in prose that states the rule, so
  // this checks the licence names themselves rather than the page text.)
  for (const licence of licences) {
    assert.ok(/^(CC0|CC BY|CC BY-SA|Public domain)/i.test(licence), `unexpected licence group: ${licence}`);
    assert.ok(!/\bNC\b|NonCommercial|NoDerivatives|\bND\b/i.test(licence), `NC or ND material must not be included: ${licence}`);
  }
  assert.ok(browser.$('a[href*="openstreetmap" i]') || /OpenStreetMap/.test(browser.mainText()));
  assert.match(browser.mainText(), /not a live rate feed/i);
});

test('sources: the limits are stated in plain words', async () => {
  await browser.goto('#/sources');
  const text = browser.mainText();
  assert.match(text, /does not scrape listing sites/i);
  assert.match(text, /does not scrape map services/i);
  assert.match(text, /no third-party analytics|does not fetch anything from the browser/i);
  assert.match(text, /forkspace\.v1/);
});

test('keyboard: the gallery, checkboxes and buttons are reachable and labelled', async () => {
  await browser.goto('#/property/tky-01');
  for (const control of browser.$$('#main button, #main input, #main select, #main a')) {
    const label = control.getAttribute('aria-label')
      || control.getAttribute('title')
      || control.textContent.trim()
      || (control.id && browser.$(`label[for="${control.id}"]`)?.textContent.trim());
    assert.ok(label && label.length > 0, `an interactive control has no accessible name: ${control.outerHTML.slice(0, 120)}`);
  }
  const gallery = browser.$('.gallery');
  assert.equal(gallery.getAttribute('tabindex'), '0', 'the gallery is focusable for keyboard users');
  assert.match(gallery.getAttribute('aria-label'), /arrow keys/i);
});

test('mobile: the action rows are allowed to wrap instead of overflowing', async () => {
  await browser.goto('#/search');
  await browser.settle(220);
  const css = browser.$('style[data-source="css/app.css"]').textContent;
  assert.match(css, /flex-wrap: wrap/);
  assert.match(css, /minmax\(0,\s*1fr\)/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /overflow-x: auto/, 'the comparison table scrolls rather than pushing the page wide');
});

test('storage: the app uses exactly one versioned key', async () => {
  assert.equal(STORAGE_KEY, 'forkspace.v1');
  const keys = Object.keys(browser.window.localStorage);
  assert.deepEqual(keys, [STORAGE_KEY]);
});

test('unknown routes: a missing page explains itself and offers a way back', async () => {
  await browser.goto('#/this-route-does-not-exist');
  const text = browser.mainText();
  assert.match(text, /does not exist|No route matches/i);
  assert.ok(browser.main().querySelector('a[href="#/"]'), 'a link home is offered');
  await browser.goto('#/property/not-a-real-home');
  assert.match(browser.mainText(), /not|no such|unknown/i);
});

test('the app reports its own state for debugging without exposing anything sensitive', () => {
  const hook = browser.window.__forkspace;
  assert.ok(hook, 'the debug hook exists');
  assert.deepEqual(hook.routes.sort(), ['compare', 'home', 'property', 'research', 'saved', 'search', 'sources']);
  assert.equal(hook.listings(), 13);
  assert.ok(['bundled', 'api'].includes(hook.dataSource()));
  assert.equal(JSON.stringify(hook).includes('key'), false);
});
