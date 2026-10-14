/**
 * A small jsdom harness for the render tests.
 *
 * It loads the real index.html and the real stylesheet (so the document has the
 * same structure and class names the browser gets), installs the browser globals
 * the modules expect, and provides a deterministic way to move between routes.
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

export const ROOT = new URL('../../', import.meta.url);
const HTML_PATH = new URL('index.html', ROOT);
const CSS_PATH = new URL('css/app.css', ROOT);

function define(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

export function createBrowser({ fetchImpl } = {}) {
  const dom = new JSDOM(readFileSync(HTML_PATH, 'utf8'), {
    url: 'http://127.0.0.1:5173/',
    pretendToBeVisual: true
  });
  const { window } = dom;

  // The real page links a stylesheet and a module script. jsdom would try to
  // fetch both, so they are removed here and the CSS is inlined instead.
  window.document.querySelectorAll('link[rel="stylesheet"], script[type="module"]').forEach((node) => node.remove());
  const style = window.document.createElement('style');
  style.setAttribute('data-source', 'css/app.css');
  style.textContent = readFileSync(CSS_PATH, 'utf8');
  window.document.head.append(style);

  let hashEvents = 0;
  window.addEventListener('hashchange', () => { hashEvents += 1; });

  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false
  });

  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('location', window.location);
  define('history', window.history);
  define('localStorage', window.localStorage);
  define('sessionStorage', window.sessionStorage);
  define('HTMLElement', window.HTMLElement);
  define('HTMLInputElement', window.HTMLInputElement);
  define('Element', window.Element);
  define('Node', window.Node);
  define('Event', window.Event);
  define('CustomEvent', window.CustomEvent);
  define('KeyboardEvent', window.KeyboardEvent);
  define('MouseEvent', window.MouseEvent);
  define('HashChangeEvent', window.HashChangeEvent);
  define('getComputedStyle', window.getComputedStyle.bind(window));
  define('matchMedia', window.matchMedia);
  define('requestAnimationFrame', (callback) => window.setTimeout(() => callback(Date.now()), 0));
  define('cancelAnimationFrame', (id) => window.clearTimeout(id));
  define('fetch', fetchImpl || (async () => { throw new TypeError('fetch is not available in this test'); }));

  const browser = {
    dom,
    window,
    document: window.document,

    /** Wait for timers and microtasks. */
    async settle(ms = 0) {
      await new Promise((resolve) => window.setTimeout(resolve, ms));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    },

    /**
     * Move to a hash route and let the app re-render. jsdom fires its own
     * hashchange asynchronously, so an event is dispatched here as well: the app
     * renders from its listener either way.
     */
    async goto(hash, { wait = 5 } = {}) {
      window.location.hash = hash;
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
      await browser.settle(wait);
    },

    hashEvents: () => hashEvents,

    main() {
      return window.document.getElementById('main');
    },

    body: () => window.document.body.textContent,

    /** All text the visitor can read, with whitespace collapsed. */
    text() {
      return (window.document.body.textContent || '').replace(/\s+/g, ' ').trim();
    },

    mainText() {
      return (browser.main().textContent || '').replace(/\s+/g, ' ').trim();
    },

    $(selector, scope = window.document) {
      return scope.querySelector(selector);
    },

    $$(selector, scope = window.document) {
      return [...scope.querySelectorAll(selector)];
    },

    /** Click a real element, which is the only way an interaction is proven. */
    click(element) {
      element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    },

    /** Change a form control the way a person would. */
    change(element, value) {
      if (value !== undefined) element.value = value;
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
    },

    input(element, value) {
      if (value !== undefined) element.value = value;
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
    },

    submit(form) {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    },

    key(element, key) {
      element.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
  };

  return browser;
}

/** A fetch stand-in that answers the FORKSPACE API shapes the views expect. */
export function apiStub({ aiStatus, listings } = {}) {
  return async (path) => {
    const url = String(path);
    const json = (payload, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(payload),
      json: async () => payload
    });
    if (url.endsWith('/api/ai/status')) {
      return json(aiStatus || {
        adapter: 'mock',
        model: null,
        modelConfigured: false,
        textLimit: 1000,
        disclosure: 'No model key is configured, so a deterministic demo reader extracts preferences from your words.',
        warning: 'Demo adapter: no language model is involved and no internet search happens.'
      });
    }
    if (url.endsWith('/api/listings') && listings) {
      return json({ listings, count: listings.length, demoOnly: true });
    }
    if (url.includes('/api/')) {
      return json({ error: { code: 'not_found', message: `No endpoint for ${url}` } }, 404);
    }
    throw new TypeError(`unexpected request in test: ${url}`);
  };
}
