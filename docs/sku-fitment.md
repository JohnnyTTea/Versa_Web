# SKU reference-product comparison

The feature compares our AIS product descriptions with the current reference product. It does not train on, read, or submit the uploaded human review column as a feature. Goods ID is an identifier, never a substitute for SKU.

## Current comparison policy: four fields

Only model years, vehicle model, color/finish, and named style determine the result. Brand, images, material, product type, dimensions and package quantity do not affect pass/fail. Explicit body/chassis/trim contradictions remain part of the vehicle-model check; missing optional qualifiers do not block a match.

- `FIT`: all four fields have usable evidence and match. Overlapping year ranges and intersecting model ranges are accepted under this relaxed policy, with an explicit explanation.
- `NOT FIT`: a known mismatch in one of the four fields. Named styles are compared textually; no image check is required.
- `REVIEW`: a core field is missing/ambiguous, the reference cannot be retrieved, variants are uncertain, or local sources contradict each other.
- `INVALID`: missing SKU, unknown SKU, or missing reference URL.

Local features are taken from Desc1/Desc2, supplemented by known SKU color/style codes. For example GBK means gloss black, MBK means matte black, CFL means carbon-fiber look, and IKV2 means IKON V2 style. Unknown codes and incomplete embedded year codes are not guessed. The per-field source is exported. A generic black description may be refined by a known finish code; an explicit contradictory color requires review.

Each dimension reports `same`, `different`, `partial`, or `unknown`, alongside both values and a reason. Evidence coverage counts comparable fields out of four; it is not a confidence score. FIT means the four configured textual attributes match, not independently verified physical interchangeability. Price review remains separate.

## Sources and retrieval

Read-only source: `aisdata0.item`. Product-scoped HTML and Product JSON-LD are extracted from supported Amazon, eBay and Temu HTTPS pages. Navigation, recommendations, generic vehicle pickers and the rest of the page body are excluded. There is a 20-second request limit, a 3-MiB response limit, and bounded concurrent processing. The importer preserves every input row, including errors.

Known limits: extraction dictionaries are incomplete; selectors and metadata vary; dynamically rendered or access-restricted pages may need manual review. No captcha bypass or third-party model service is used. Multi-variant pages are marked unconfirmed unless the selected options are available.

## Evidence and downloads

Snapshots are stored under `server/tmp/fitment/*.json.gz`, excluded from Git. Each contains the raw page, SHA-256, retrieval metadata, local attributes and their source, field-level decisions, and analysis version. Back up this directory if historical evidence must survive server replacement. Updating code does not delete it.

`GET /api/report/data/analyze/evidence?id=<uuid>` downloads authenticated JSON evidence. The results CSV contains both sides of each dimension and evidence IDs. The current analysis version is `rules-v3-four-fields`.

## Validation

Regression tests cover failed fetches and expired pages, missing metadata, platform-neutral parsing, recommendation contamination, aliases, finishes, material appearances, range overlap, body restrictions, variant uncertainty, label leakage, row failures and snapshot persistence. Historical human notes and current pages may differ. Live sample outputs are evidence for review, not a held-out accuracy score.

Production updates must run the repository update script so the added HTML parser dependency is installed before building.
