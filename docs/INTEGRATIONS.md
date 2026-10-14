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

## 4. Geocoding

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

## 5. Research assistant

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

## 6. ONS Price Index of Private Rents (optional)

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

## 7. Photography

Every image in `assets/photos/` is a real, openly licensed photograph of a place, used
under CC0, CC BY, CC BY-SA or public domain. No non-commercial and no no-derivatives
material is included. Photographer, licence and file page are recorded per image in
`assets/js/data/photos.js`, and every gallery carries the caption *Illustrative photos ·
not of this specific home*. No photograph shows any home in the dataset.

## 8. Currency

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
  application's own files, and the Content-Security-Policy enforces that.
