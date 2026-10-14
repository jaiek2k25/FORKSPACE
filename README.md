# FORKSPACE

A working prototype for renting anywhere in the world: find a home, understand what it
really costs, compare a shortlist side by side, and research a brief in plain language —
with verified data, estimates and unknown information kept visibly separate.

**Every home in this build is fictional.** The addresses, rents and fees are written for
the prototype. No record is a real listing, no record carries a source URL or a
verification timestamp, and every one is labelled *Sample data · not verified*. Nothing
in this repository contains licensed data, an API key, or an open-data spreadsheet.

---

## What it does

| Route | What it is for |
| --- | --- |
| `#/` | Search with filters, suggested destinations, and how the tool helps |
| `#/search` | Results as cards, sorting, active-filter chips, list/map toggle, favourites, compare selection |
| `#/property/:id` | One home: photo gallery, full cost breakdown, neighbourhood and commute estimates, provenance, questions to ask |
| `#/compare?ids=a,b,c` | Two to four homes side by side, best value marked, differences-only view |
| `#/research` | Describe what you want; the assistant reads requirements and scores the sample homes in code |
| `#/saved` | Saved homes, named shortlists, comparison selection |
| `#/sources` | Every source: type, licence, attribution, last check, freshness, and the wording rules |

Three ideas run through the whole interface:

1. **Known, estimate, unknown.** Every money figure carries one of those three labels.
   Unknown fees are never added to a total, and unknown rent can never be treated as
   fitting a budget.
2. **The word "Verified" needs evidence.** It appears only where a record has a
   verification timestamp. Demo records say *Sample data · not verified*; a source
   without a timestamp says *Stated, not verified*.
3. **No invented claims.** The assistant does not search the internet, the demo records
   are never geocoded, no listing site is scraped, and no map service is scraped.

## Run it

```bash
npm install          # only test and tooling dependencies; the app itself has none
npm start            # http://localhost:5173
npm run dev          # same, with restart-on-change
```

Node 20 or newer. There is no build step: the browser loads ES modules directly.

### Check it

```bash
npm test             # logic, integrations, AI, geocoding, configuration, server, jsdom render
npm run test:unit    # the pure Node suites only
npm run test:render  # jsdom render suite only
npm run test:browser # Playwright + Chromium: layout, axe-core, interactions
npm run check:secrets# scans the tree for anything that looks like a key
node tools/axe-report.mjs "#/" "#/search"   # accessibility audit of specific routes
```

The browser suite needs a Chromium build. `tools/local-chromium.mjs` finds one in this
order: `CHROMIUM_PATH`, a Playwright download, then a packaged build. On a normal machine
`npx playwright install chromium` is the simplest route.

## Configuration

All configuration is environment driven. Copy `.env.example` to `.env` (git-ignored) or
set the variables directly. **No key value is ever logged, returned in a response, put in
an error message, or committed.**

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `5173` | Listening port. An invalid port stops start-up. |
| `HOST` | `0.0.0.0` | Listening address. |
| `NVIDIA_API_KEY` | _(unset)_ | Enables the model adapter for the research assistant. Without it, a deterministic reader runs instead and accounts are not needed. |
| `NVIDIA_MODEL` | `poolside/laguna-xs-2.1` | Chat model used to extract preferences. |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | Must be HTTPS, or start-up is refused. |
| `GEOCODER` | `nominatim` | `nominatim`, `google`, or `none`. |
| `GEOCODER_CONTACT` | _(unset)_ | Required before the public geocoder is used at all — Nominatim's policy requires an identifying contact. |
| `GEOCODER_USER_AGENT` | derived | Sent with every geocoding request. |
| `GOOGLE_MAPS_API_KEY` | _(unset)_ | Only used when `GEOCODER=google`. Without it the endpoint answers `503 not_configured`. |
| `AUTHORISED_FEED_URL` / `_KEY` / `_LICENSEE` | _(unset)_ | A partner feed you are licensed to call. Disabled unless all three are set; HTTPS only; redirects refused. |
| `LICENSED_DATA_DIR` | `./data-imports` | Folder for licensed JSON exports. Not web-served, git-ignored. |
| `MAP_ENABLED` | `1` | Draw maps with the vendored Leaflet and OpenStreetMap tiles. Set to `0` for no external host at all. |
| `MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Must be an HTTPS XYZ template. The one origin here is the only remote entry added to the CSP, and only for images. |
| `MAP_MAX_ZOOM` | `19` | Highest zoom the tile provider serves. |
| `TRUST_PROXY` | `0` | Set to `1` only behind a proxy you control, so `X-Forwarded-For` can be trusted for rate limiting. |
| `HSTS_MAX_AGE` | `0` | When greater than zero, `Strict-Transport-Security` is sent. Leave at 0 unless you serve HTTPS. |

## API

| Endpoint | Notes |
| --- | --- |
| `GET /api/health` | status, version, uptime, and whether AI and maps are configured — booleans only |
| `GET /api/sources` | source register with licence, attribution, freshness and the wording rules |
| `GET /api/listings` | the records, with their provenance |
| `GET /api/ai/status` | which adapter is active and which model would be used |
| `POST /api/ai/extract` | `{ "brief": "…" }` → preferences as JSON. Limits: 4096-byte body, 1000 characters, 20 requests per minute per client |
| `GET /api/geo/status` | geocoder policy, cache, and why it is or is not enabled |
| `GET /api/geocode?q=` | 3–200 characters, one request per second, 30-day cache, 30 requests per minute per client |

All API responses are `Cache-Control: no-store`. Unknown `/api` paths return JSON 404s,
never HTML.

## What is inside

```
index.html            single page shell
src/main.js           entry point
assets/js/app.js      router, shell, notifications
assets/js/views/      one module per route
assets/js/components/ cards, icons, badges, photo credits
assets/js/lib/        filters, costs, duplicates, research, freshness, store, dom helpers
assets/js/data/       the sample dataset, schema, sources, questions, FX table, benchmarks
css/app.css           the whole stylesheet
server/               configuration, security headers, static allowlist, API, adapters, geocoding
tools/                photo preparation, benchmark generation, Chromium resolver, axe audit
tests/                unit, integration, render (jsdom) and browser (Playwright) suites
docs/                 integrations, listing schema, deployment
```

### Data and provenance

Each record carries a `source`, a `verification` block, a `status`, a `provenance` block
and a `fees` list where every fee is `known`, `estimate` or `unknown` with a frequency and
a note. `docs/LISTING_SCHEMA.md` describes all of it. The provider-independent shape is
what makes the licensed-file and authorised-REST adapters possible without either of them
touching the interface.

### Adapters

* **licensed-file** — JSON exports placed in `data-imports/` (never web-served). A file
  without a licence declaration is ignored entirely; a record missing source name, kind,
  attribution or licence is rejected with a logged reason.
* **authorised-REST** — a partner API you have written permission to call, with a bearer
  token held on the server, HTTPS required and redirects refused.
* **demo** — this repository's own fictional dataset, always labelled as such.

Duplicate detection classifies pairs as exact, probable (rent within 2%) or possible
(within 5%); probable and possible matches are reported and never merged.

### Mapping

Leaflet is vendored into `assets/vendor/leaflet/` and served from this origin, so the
Content-Security-Policy keeps `script-src 'self'` and `style-src 'self'`. Tiles come from
the single host in `MAP_TILE_URL`, with attribution always visible and the tile credit
linking to the licence. The browser is the only place a tile is fetched, and only for the
area someone is actually looking at. `docs/INTEGRATIONS.md` explains what the map will and
will not draw, and why there is no "nearby rentals" layer.

### Photography

Every photograph is a real, openly licensed image of a place — CC0, CC BY, CC BY-SA or
public domain — with its photographer credited by name in `assets/js/data/photos.js` and
on `#/sources`. No non-commercial and no no-derivatives material is used. No photograph
shows any home in the dataset: the caption *Illustrative photos · not of this specific
home* appears with every gallery.

## Limitations, stated plainly

* The dataset is fictional. Nothing here describes the real world.
* The research assistant reads the sample records only. It does not search the internet,
  does not contact landlords, and does not claim to have found anything real.
* Walkability, commute times and fee estimates are illustrative figures computed by this
  prototype from the record's own fields. They are labelled as estimates wherever shown.
* The currency table is static and dated; it is not a live rate feed.
* The map view is a real OpenStreetMap map, and nothing is plotted on it. Every home here
  is fictional, so no record carries a checked location — `schema.js` refuses to give a demo
  record coordinates at all. Filter to one city to see a real map of its centre; the panel
  says plainly that no home is on it. The moment a record arrives with checked coordinates,
  the pin appears on the property page, which is covered by a test.
* The ONS rent benchmark is an area average for the whole private rented stock. It is not
  a price for any home, and it has no bedroom or property-type split. See
  `docs/INTEGRATIONS.md`.
* There is no account system and no server-side storage: saved homes and checklists live
  in this browser under one versioned key.

## Before you use this for anything public

1. Replace the demo dataset with data you are licensed to use, or enable the authorised
   feed adapter.
2. Set `GEOCODER_CONTACT` (and choose a provider) before enabling geocoding, and honour
   whatever the provider's terms require of you.
3. Terminate TLS in front of the app, set `HSTS_MAX_AGE`, and set `TRUST_PROXY=1` only if
   you are behind a proxy you control.
4. Review `docs/DEPLOYMENT.md` for the container build and the health check.
5. Keep the wording rules: label known, estimate and unknown; never call a record verified
   without a verification timestamp; never present a sample record as real.

## Licence

The application code here is a prototype. Photographs belong to their photographers under
the licences credited in `assets/js/data/photos.js`. The ONS figures, where loaded, are
used under the Open Government Licence v3.0.
