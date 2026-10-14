# Deployment

FORKSPACE is a plain Node HTTP server with no build step and no runtime dependencies.
Deployment is therefore mostly a matter of configuration and TLS.

---

## Running it

```bash
# direct
PORT=5173 HOST=0.0.0.0 npm start

# container
docker build -t forkspace .
docker run --rm -p 5173:5173 --env-file .env forkspace
```

The server validates its configuration at start-up. An invalid port or a non-HTTPS
upstream URL **refuses to start**, with a message naming the setting, never its value.
Missing keys and a missing geocoder contact are warnings: the app runs, with the demo
adapter for the research assistant and the geocoder switched off.

## Container

`Dockerfile` builds on `node:20-alpine`, installs production dependencies only, runs as
the non-root `node` user, and declares a health check against `/api/health`. `.dockerignore`
keeps the following out of the image, which matters as much for honesty as for size:

`.env`, `.git`, `tests`, `tools`, `docs`, `data-imports` (licensed data), the ONS
spreadsheet, and any local notes.

The image contains the application, the sample dataset, the prepared photographs and the
public documentation — nothing else.

### Health check

```
HEALTHCHECK CMD wget -qO- http://127.0.0.1:5173/api/health || exit 1
```

`GET /api/health` returns status, version, uptime and whether the AI and maps integrations
are configured. It returns booleans, not values: no URLs, no keys, no contact address.

## Behind a proxy

Set `TRUST_PROXY=1` **only** when a proxy you control sets `X-Forwarded-For`. Until then
the socket address is used for rate limiting, because a client-supplied header would let
anyone bypass the limits.

Set `HSTS_MAX_AGE` (for example `15552000`) only when the site is genuinely served over
HTTPS. On plain HTTP it would lock visitors out of the deployment it is meant to protect,
which is why the header is off by default.

## Security posture

Enforced in code, covered by tests:

* **Content-Security-Policy** — `script-src 'self'`, `style-src 'self'`, `font-src 'self'`,
  `connect-src 'self'`, `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'none'`.
  No inline scripts, no inline styles, and no third-party scripts at all. The single remote
  entry is the configured tile origin in `img-src`, and only when `MAP_ENABLED=1`: map tiles
  are images and nothing else leaves the origin.
* **Referrer-Policy** — `no-referrer`, except for the app shell, which sends
  `strict-origin-when-cross-origin` so the tile policy's Referer requirement is met without
  disclosing a path. With `MAP_ENABLED=0` the shell sends no referrer either.
* **Static allowlist** — `index.html`, `css/`, `src/`, `assets/` and `docs/` are served.
  Everything else is 404: `server/`, `tests/`, `tools/`, `data-imports/`, `package.json`,
  `README.md`, `.env`, and the ONS spreadsheet. Traversal is rejected after normalisation.
* **Write methods** — `POST`, `PUT`, `PATCH` and `DELETE` are refused on static paths and
  never reach the file system.
* **API** — `Cache-Control: no-store`, JSON 404s for unknown paths, and a 405 with an
  `Allow` header when a route is called with the wrong method.
* **Rate limits** — 20 requests/minute/client for the assistant, 30 for geocoding, in
  separate buckets, with the table swept every minute.
* **Timeouts** — 15 s for headers, 30 s for a whole request, plus a 20 s cap on the
  upstream model call.
* **Keys** — read from the environment or a git-ignored `.env`, held in a non-enumerable
  holder on the config object so `JSON.stringify(config)` cannot leak one, masked in logs
  by pattern as well as by value, and never echoed in an error.

## Data source checklist before going live

1. Replace or augment the demo dataset with data you are licensed to use
   (see `docs/INTEGRATIONS.md`).
2. If you import a partner export, drop it in `data-imports/` and confirm the log lines:
   a file with no licence is skipped, and an incomplete record is rejected.
3. If you enable the ONS benchmark, generate it with your own downloaded CSV:
   `node tools/generate-benchmark.mjs --csv path/to/ons-pipr.csv`. Check the reported
   reference period and release date against the source page, and never describe an older
   reference period as "the latest release".
4. Set `GEOCODER_CONTACT` before enabling geocoding. The geocoder stays off without it.
5. Check that `/api/listings` reports `demoOnly: false` once real records are in place —
   the flag drives the disclosure the interface shows.
6. Decide where map tiles come from before you carry traffic. `MAP_TILE_URL` defaults to
   the OpenStreetMap Foundation's donated servers, which are best-effort with no SLA and are
   not sized for a commercial load. Point it at a provider you have arranged, or set
   `MAP_ENABLED=0` to ship the map view with its written explanation and no external host.
   Attribution is drawn by the application and must stay visible: the data is ODbL.
7. Remember that only a record with a checked location is plotted. `docs/LISTING_SCHEMA.md`
   describes the `coordinates` block, and a demo record is refused coordinates outright.

## Verifying a deployment

```bash
curl -s localhost:5173/api/health          # status, version, uptime, configured booleans
curl -s localhost:5173/api/sources | head  # the source register the interface shows
curl -sI localhost:5173/ | grep -i content-security-policy
curl -s -o /dev/null -w '%{http_code}\n' localhost:5173/package.json   # 404
npm test && npm run test:browser
```

`npm run check:secrets` scans the tree for anything shaped like a credential before you
commit or build an image.

## Rollback and operations notes

* The service holds no state beyond an in-process geocode cache and rate-limit counters.
  Restarting loses nothing that matters.
* `SIGTERM` and `SIGINT` shut down gracefully, with an 8-second cap before a forced exit.
* Logs are single-line, timestamped, and contain method, path, status and duration. They
  never contain configuration values, upstream bodies or request bodies.
