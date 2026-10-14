# Listing schema

`SCHEMA_VERSION = 1.1.0`

The schema is provider independent. It is the contract between the dataset, the adapters
and the interface, and it is enforced by `assets/js/data/schema.js` —
`validateSource`, `validateListing` and `assertValidListing`. A record that fails
validation is dropped with a logged reason rather than served half-broken.

Run the validator yourself:

```bash
node -e "import('./assets/js/data/listings.js').then(async ({LISTINGS}) => {
  const { validateListing } = await import('./assets/js/data/schema.js');
  for (const l of LISTINGS) console.log(l.id, validateListing(l).ok ? 'ok' : validateListing(l).errors);
})"
```

---

## Record

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable, unique within the dataset. |
| `title` | string | Short, descriptive. |
| `city`, `cityId`, `country`, `area` | string | `cityId` is the filter key. |
| `address` | string | Free text. Demo records use an invented address. |
| `propertyType` | enum | `apartment`, `house`, `studio`, `townhouse`, `loft`, `shared`, `room`. |
| `bedrooms`, `bathrooms` | number | |
| `furnishing` | enum | `furnished`, `semi-furnished`, `unfurnished`, `upholstered`. `upholstered` is the Dutch *gestoffeerd* case: flooring and window coverings, no furniture. |
| `leaseMonths` | number | Minimum term. `0` means "no fixed minimum", and the record must say so in its note. |
| `amenities` | string[] | Plain names, matched case-insensitively. |
| `status` | enum | `available`, `pending`, `let`, `withdrawn`, `sample`, `unknown`. |
| `rent` | object | See below. |
| `fees` | object[] | See below. |
| `costs` | object | Currency, locale, deposit and note fields used by the cost table. |
| `neighbourhood` | object | Notes and, where known, named transport. |
| `commute` | object[] | Destinations with an estimate and its basis record. |
| `walkScore` | object | `{ score, basis }` — an estimate, always labelled as one. |
| `pros`, `cons`, `missing` | string[] | Written for the record, not copied from an advert. |
| `questions` | string[] | Home-specific questions, added to the shared checklist. |
| `photos` | string[] | Keys into the photo registry. Never a URL. |
| `benchmark` | string \| null | Id of an official-statistics series, for example `ons-london`. |
| `source` | object | See below. |
| `verification` | object | See below. |
| `provenance` | object | See below. |

## `source`

| Field | Requirement |
| --- | --- |
| `id` | required |
| `name` | required |
| `kind` | required; `demo`, `api`, `feed`, `dataset` or `manual` |
| `attribution` | required |
| `licence` | required |
| `url` | optional; a link to the original record |
| `termsUrl` | optional |

A record is rejected if `name`, `kind`, `attribution` or `licence` is missing. That is the
rule that makes the licensed-file adapter safe: an export with no licence cannot be
imported, in whole or in part.

## `verification`

| Field | Notes |
| --- | --- |
| `lastVerifiedAt` | ISO timestamp, or `null` |
| `method` | How it was checked, for example "agent call" |

**The interface prints the word "Verified" only when `lastVerifiedAt` is set.** Otherwise
it prints *Stated, not verified*. A demo record prints *Sample data · not verified*, and
the schema rejects a demo record that carries a timestamp at all.

Freshness then follows fixed thresholds:

| State | Condition |
| --- | --- |
| `fresh` | verified 7 days ago or less |
| `aging` | verified 8–30 days ago |
| `stale` | verified more than 30 days ago |
| `unavailable` | the home is `let` or `withdrawn`, so freshness no longer applies |
| `sample` | the record is demo data |
| `unverified` | no timestamp exists |

## `rent`

| Field | Notes |
| --- | --- |
| `amount` | number, or `null` when `kind` is `unknown` |
| `currency` | one of the nine supported codes |
| `locale` | for formatting, for example `pt-PT` |
| `kind` | `known`, `estimate` or `unknown` |
| `note` | plain words: what is included, what is excluded, and how an estimate was derived |

An `unknown` rent must carry no amount and **must fail any budget filter**, with the reason
stated. An estimate says what it was derived from.

## `fees[]`

| Field | Notes |
| --- | --- |
| `label` | for example `Condomínio`, `Key money`, `Brokerage` |
| `amount` | number, or `null` when `kind` is `unknown` |
| `currency` | ISO code |
| `kind` | `known`, `estimate` or `unknown` |
| `frequency` | `one-off`, `monthly`, `annual`, `weekly` or `unknown` |
| `refundable` | boolean or `null` |
| `note` | why it exists, who receives it, and what is uncertain |

Two rules are enforced by the validator because they are the heart of the whole idea:

1. **An unknown fee must not carry an amount.** `fees[i] has an amount but is marked
   unknown; unknown fees must never carry a figure`.
2. **A known or estimated fee must carry a number.** A fee cannot be partly stated.

Cost totals are computed in `assets/js/lib/costs.js`. Unknown fees are listed, labelled
*Unknown*, and excluded from every total. Known and estimated amounts are totalled
separately and shown separately.

> Implementation note: `Number(null) === 0` in JavaScript, so every amount check compares
> against `null` and `''` explicitly. Without that, a null amount passes a naive
> `Number.isFinite(Number(value))` test and an unknown fee silently becomes a zero.

## `provenance`

| Field | Notes |
| --- | --- |
| `isDemo` | `true` for every fictional record in this repository |
| `fetchedAt` | when an adapter imported it |
| `providerRecordId` | the partner's own id — the primary key for exact duplicate detection |
| `rawHash` | hash of the imported record, for change detection |
| `schemaVersion` | the version the record was written against |

A demo record must carry `isDemo: true` and **must not** carry a `source.url` or a
`verification.lastVerifiedAt`. Both conditions are validator errors, so a fictional home
cannot be dressed up as a real one by accident.

## Duplicate detection

`assets/js/lib/duplicates.js` classifies a pair of records:

| Class | Rule |
| --- | --- |
| `exact` | the same `providerRecordId`, or the same original `source.url` |
| `probable` | same city, area, property type and bedrooms; rents within 2%; and a title or address match |
| `possible` | same city, type and bedrooms; rents within 5% |

Probable and possible matches are **reported and never merged**. `duplicateSummary()`
returns `mergeable: 0` by design: merging live records needs a human decision, and this
prototype does not make it. Records whose rent is not stated are never compared on price.

## Adding a record

1. Write it into `assets/js/data/listings.js` (demo) or export it from your licensed
   source (adapted).
2. Give every fee a `kind` and a frequency, and add a note that a stranger could
   understand.
3. Leave `verification.lastVerifiedAt` as `null` unless someone really checked it. The
   interface will say *Stated, not verified*, which is the honest answer.
4. If you include a photo, it must be in the registry with its licence, credit and file
   page, and it must not be a picture of the actual home unless you are licensed to use
   one.
5. Run `npm test`. The schema suite validates every record, and the render suite checks
   that no page prints "null", "undefined" or "NaN" anywhere.
