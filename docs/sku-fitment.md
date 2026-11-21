# SKU reference-product comparison

The feature compares our AIS product descriptions with the current reference product. It does not train on, read, or submit the uploaded human review column as a feature. Goods ID is an identifier, never a substitute for SKU.

Report → SKU Fitment runs v4 by default. The v1 prototype and its reports are archived for historical comparison.

Choose an Excel or CSV file with SKU and 参考链接 headers, select a sheet if needed, and click 开始分析. Each upload supports up to 200 data rows, excluding the header. 下载 Excel 模板 provides a blank upload sheet and a separate example. Results appear 20 rows per page, and the table header stays visible while scrolling the results. Excel and CSV downloads include all results. The Excel workbook also includes a summary, differences, and rows needing review.

Retail page requests are sent one at a time, with a minimum eight-second gap and a longer break after every ten requests to the same site. Access challenges and temporary restrictions pause that site. Unsent rows appear as 待补查. After the displayed time, 仅补查未完成项 resumes eligible rows while retaining completed results. The Excel report also provides a 待补查 sheet when needed.

## Current comparison policy: product identity

The report uses vehicle fitment and product type to decide identity. Vehicle make, body, chassis, and trim contribute to the model check. Color is recorded separately.

- `FIT`: compatible vehicle fitment and matching product type. An unresolved color is shown as “同款，颜色待定”.
- `NOT FIT`: a known vehicle fitment conflict, or a confirmed roof-versus-trunk spoiler mounting conflict.
- `REVIEW`: a core field is missing/ambiguous, the reference cannot be retrieved, variants are uncertain, or local sources contradict each other.
- `PENDING`: the link was deferred or the reference site returned a temporary restriction.
- `INVALID`: missing SKU, unknown SKU, or missing reference URL.

Local features are taken from Desc1/Desc2, supplemented by known SKU color codes. For example GBK means gloss black, MBK means matte black, and CFL means carbon-fiber look. Unknown codes and incomplete embedded year codes are left blank. The per-field source is exported. A generic black description may be refined by a known finish code. A contradictory color is marked unconfirmed.

Each dimension reports `same`, `different`, `partial`, or `unknown`, alongside both values and a reason. Evidence coverage counts comparable years, vehicle models, and colors. Amazon.com purchase prices can be captured from the product purchase area in the same response. The report distinguishes an explicitly marked promotion from the displayed price.

## Sources and retrieval

Read-only source: `aisdata0.item`. Product-scoped HTML and Product JSON-LD are extracted from supported Amazon, eBay and Temu HTTPS pages. Navigation, recommendations, generic vehicle pickers and the rest of the page body are excluded. There is a 20-second request limit, a 3-MiB response limit, and bounded concurrent processing. The importer preserves every input row, including errors.

For Amazon US product links, the server uses SP-API when `FITMENT_AMAZON_CLIENT_ID`, `FITMENT_AMAZON_CLIENT_SECRET`, and `FITMENT_AMAZON_SELLER_REFRESH_TOKEN` are set. The seller application needs the Product Listing and Pricing roles. On Windows, set the client ID in `server/.env` and run `powershell -File .\server\scripts\configure-fitment-amazon.ps1` from the repository root to enter the two secrets with masked input. Restart the backend after configuration. After building the backend, run the same script with `-Verify` to query ASIN `B0CQBSD5L2` and print the verified price and timestamp.

The API groups up to 20 unique ASINs per batch and paces pricing requests to Amazon's default usage limit. A confirmed US Featured Offer is labeled 新品推荐报价 with its own retrieval time. When Amazon returns different prices across segments or only a parent ASIN, the price stays blank. A temporarily unavailable price can be retried while keeping the fitment decision visible.

Known limits: extraction dictionaries are incomplete; selectors and metadata vary; dynamically rendered or access-restricted pages may need manual review. No captcha bypass or third-party model service is used. Multi-variant pages are marked unconfirmed unless the selected options are available.

## Evidence and downloads

Snapshots are stored under `server/tmp/fitment/*.json.gz`, excluded from Git. Each contains the raw page, SHA-256, retrieval metadata, local attributes and their source, field-level decisions, and analysis version. Back up this directory if historical evidence must survive server replacement. Updating code does not delete it.

The results table and CSV show the current verified price, price type, evidence time, and source. SKU and reference link are sufficient to run a report. Each result includes a review note that lists concrete differences or the reason for manual review. Saved snapshots support audit downloads and historical validation. The daily report uses the current request to obtain product evidence and prices.

`GET /api/report/data/analyze/evidence?id=<uuid>` downloads authenticated JSON evidence. The results CSV contains both sides of each dimension and evidence IDs. The current analysis version is `rules-v4-fitment-resume`.

## Validation

Regression tests cover failed fetches and expired pages, missing metadata, platform-neutral parsing, recommendation contamination, aliases, finishes, material appearances, range overlap, body restrictions, variant uncertainty, label leakage, row failures and snapshot persistence. Historical human notes and current pages may differ. Live sample outputs are evidence for review, not a held-out accuracy score.

Production updates must run the repository update script so the added HTML parser dependency is installed before building.
