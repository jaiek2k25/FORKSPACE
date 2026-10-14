# Integrations

FORKSPACE deliberately has very few connections. Each one is here with the rules that
govern it, what it costs, and what it will not do.

Nothing in this document is scraped. No listing site is read, and no map service is
scraped. If a source cannot be used under a licence you hold, it does not belong in this
codebase.

---

## 1. The demo dataset (always on)

The 13 records in `assets/js/data/listings.js` are fictional. They exist so the interface
can be exercised honestly: every one carries `provenance.isDemo: true`, no `source.url`,
and no `verification.lastVerifiedAt`, and the schema *rejects* a demo record that has
either. That is enforced in `assets/js/data/schema.js`, so a demo record cannot quietly
acquire a source link or a verification timestamp later.

Displayed as: **Sample data · not verified**.

## 2. Licensed-file adapter

For a dataset you are licensed to use and have received as a file.

* **Where the files go:** `LICENSED_DATA_DIR`, default `./data-imports`. The folder is
  git-ignored and is **not** served by the static handler — a request for
  `/data-imports/anything` returns 404.
* **Expected shape:** a JSON object with a `licence` string, an optional file-level
  `source`, and a `records` array. A bare array is accepted only if the licence is
  declared, because a licence must never be assumed.
* **What is rejected:** a file with no licence declaration is ignored entirely, with a log
  line naming the file. A record missing `source.name`, `source.kind`, `source.attribution`
  or `source.licence` is rejected, with the reason logged. Records are also validated
  against the listing schema.
* **What it never does:** it never fetches anything. You obtain the export under your own
  agreement and place the file.

Displayed as: the source's own name and licence, plus the freshness of its verification
timestamp. If the source supplies no timestamp, the record reads **Stated, not verified**.

```json
{
  "licence": "Partner agreement 2026-04, internal redistribution",
  "source": {
    "id": "partner-a",
    "name": "Partner A",
    "kind": "feed",
    "attribution": "Partner A",
    "licence": "Partner agreement 2026-04",
    "termsUrl": "https://partner.example/terms"
  },
  "records": [ { "id": "p-1", "title": "…", "fees": [], "provenance": { "isDemo": false } } ]
}
```

## 3. Authorised REST adapter

For a partner API you have **written permission** to call, with an access token.

| Setting | Behaviour |
| --- | --- |
| `AUTHORISED_FEED_URL`, `AUTHORISED_FEED_KEY`, `AUTHORISED_FEED_LICENSEE` | All three are required. With any missing, the adapter is disabled and the app runs on the demo dataset. |
| Transport | `https://` only. A plain-HTTP URL is refused outright. |
| Redirects | Refused (`redirect: 'error'`), so a request cannot be bounced elsewhere. |
| Auth | `Authorization: Bearer …`, sent from the server only. |
| Timeout | `AUTHORISED_FEED_TIMEOUT_MS`, default 15 s. |
| Failure | Degrades to no records plus a fixed status token (`upstream_http_500`, `upstream_timeout`, `upstream_unreachable`). An upstream message is never passed through, because it can echo the token back. |
| Key exposure | The key never appears in a response, a log line, an error message or the browser. |

## 4. Map tiles and Leaflet

The map is the only place where the browser is allowed to touch a host that is not ours,
and it is deliberately narrow.

| Piece | Where it comes from |
| --- | --- |
| Leaflet 1.9.4 | Vendored into `assets/vendor/leaflet/`, served from this origin. BSD-2-Clause, licence text kept beside it. No CDN, no third-party script or style. |
| Tiles | `MAP_TILE_URL`, default `https://tile.openstreetmap.org/{z}/{x}/{y}.png` — the exact URL the tile policy requires. |
| Attribution | Always rendered, in Leaflet's own control, with Leaflet's control left switched on and never hidden behind a toggle. |
| Content-Security-Policy | `img-src` gains that one origin and nothing else. `script-src`, `style-src`, `font-src` and `connect-src` stay `'self'`. |
| Referrer-Policy | `no-referrer` everywhere **except** the app shell, which sends `strict-origin-when-cross-origin` — the bare origin and no path, which the tile policy requires. |

The tile URL is served to the browser by `GET /api/geo/status` rather than compiled in, so
an operator can switch provider from configuration alone without waiting for a new client
build — which the policy asks for. If that call fails, the client fails closed: no tile
URL, no map, no remote request.

**What it never does**

* **No Overpass, and no "nearby rentals" layer.** `building=apartments` and
  `building:use=residential` describe building types, not lettings. Drawing those as
  nearby rental homes would assert something the data does not say. Nearby homes can only
  ever come from *our own* licensed records that carry real coordinates.
* **No prefetching, no offline download, no tile archiving.** Tiles are requested only for
  the viewport someone is looking at, and the browser's own cache handles revisits.
* **No reverse geocoding to guess an address**, and no map request for a fictional record.

### What is plotted, and what is not

Only a record carrying a checked location is plotted. That is enforced in three places:

1. `assets/js/data/schema.js` rejects `coordinates` that are out of range, missing a
   `source`, missing a `checkedAt`, or attached to a record with `provenance.isDemo: true`.
2. `assets/js/lib/map.js` re-checks the same conditions before handing anything to Leaflet.
3. The server's own `/api/geo/status` states the rule in the payload that the client reads.

Every record in this repository is fictional, so **nothing is plotted on any map in this
build.** The map view centres on the city you filter to — from a static, dated table of
approximate city centres — and says in the panel that no home is on it. The property page
shows its written explanation instead of an empty canvas. Both paths are exercised by
tests, including a fixture that proves the pin appears the moment a record has real
coordinates.

If you are running this at any volume, the tile policy's expectation is that you
self-host or use a commercial provider rather than relying on the OSM Foundation's
donated servers. Set `MAP_TILE_URL` to your provider's XYZ template, check their terms on
caching and attribution, and leave `MAP_ENABLED=0` if you would rather ship the map view
with no external host at all — everything else in the interface is unaffected.

## 5. Geocoding

Geocoding exists for **real listing addresses**. Every demo record has no coordinates and
no verified address, so this build never geocodes a home and the interface says so.

### Nominatim (default)

The public OpenStreetMap service is used strictly within its usage policy, enforced in
code rather than described in a comment:

* **One request per second**, serialised through a queue, so parallel requests cannot
  breach the limit.
* **An identifying User-Agent** that includes `GEOCODER_CONTACT`. Without a contact the
  geocoder is *disabled* — it does not fall back to an anonymous request.
* **30-day cache**, so a repeated query does not reach the provider again.
* **Redirects refused.**
* **No autocomplete and no bulk use.** Queries are 3–200 characters, one place per
  request, and the browser never calls the endpoint while someone types.
* **Attribution** `© OpenStreetMap contributors (ODbL)` is returned in the payload, so a
  result cannot be displayed without it.

### Google (opt-in)

Set `GEOCODER=google` and `GOOGLE_MAPS_API_KEY`. Without a key the endpoint answers
`503 not_configured`, and the message explains that billing applies to the Google
provider — it does not fall back silently. The key is used server-side only and never
reaches the browser. Results are cached for 30 days to limit both cost and calls.

### Neither

Set `GEOCODER=none`. The endpoint answers `503 geocoder_disabled`. The map view still
works, because it is a stylised layout and not a map.

## 6. Research assistant

Two adapters, one contract: the model produces **preferences only**. All matching,
scoring, cost arithmetic and wording is computed in `assets/js/lib/research.js`, in code,
from the records.

| | Model adapter | Demo adapter (default) |
| --- | --- | --- |
| When | `NVIDIA_API_KEY` is set | no key configured |
| Endpoint | `NVIDIA_BASE_URL`, default `https://integrate.api.nvidia.com/v1` (HTTPS enforced at start-up) | no network call at all |
| Model | `NVIDIA_MODEL`, default `poolside/laguna-xs-2.1` | none |
| Output | one JSON object of preferences | the same object, read by fixed rules |
| Limits | 4096-byte body, 1000 characters, 20 requests/minute/client, 20 s upstream timeout, redirects refused | same request limits |

The response is untrusted input: a code fence or surrounding prose is trimmed, unknown
fields are discarded with a count reported to the interface, values are clamped, and a
field asking the model to pick a winner is thrown away. If the model cannot be used, the
report says so and falls back to the deterministic reader.

Models known to be unavailable on this endpoint are listed in `server/ai.js` and are never
selected; the retired chat model is explicitly blocked.

## 7. ONS Price Index of Private Rents (optional)

Where loaded, the Office for National Statistics' private rent index is shown on London
property pages and in research results that mention London, labelled **Area benchmark ·
official statistics**.

* **Licence:** Open Government Licence v3.0. Attribution is shown with the figures.
* **What it is:** an area average for the whole private rented stock.
* **What it is not:** the asking rent for a specific home. It has no bedroom split and no
  property-type split, and it is not a valuation. Those caveats are printed with the
  figures, not buried.
* **How it gets here:** `npm run benchmarks` regenerates
  `assets/js/data/benchmarks.js` from a CSV you download yourself
  (`node tools/generate-benchmark.mjs --csv path/to.csv`). The spreadsheet stays outside
  the web root, is never served, and is git-ignored.
* **If it is absent:** the interface says the official statistics file is not loaded rather
  than showing a figure of unknown provenance.

## 8. Photography

Every image in `assets/photos/` is a real, openly licensed photograph of a place, used
under CC0, CC BY, CC BY-SA or public domain. No non-commercial and no no-derivatives
material is included. Photographer, licence and file page are recorded per image in
`assets/js/data/photos.js`, and every gallery carries the caption *Illustrative photos ·
not of this specific home*. No photograph shows any home in the dataset.

## 9. Currency

`assets/js/data/fx.js` holds a static, dated, illustrative table. It is not a live rate
feed, it is labelled as such wherever it is used, and budgets are stored in INR and
converted only for display. A currency outside the table is reported to the visitor rather
than converted: the amount is not turned into a limit, because converting it would mean
inventing a rate.

## What this build will never connect to

* A listing site, by scraping or by any other means.
* A map service, by scraping.
* Anything that requires a key it does not have.
* Any third-party script, font, analytics or tracking pixel: the browser loads only this
  application's own files, and the Content-Security-Policy enforces that. Map tiles are the
  single, explicitly configured exception, and they are images only.
