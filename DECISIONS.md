# Decisions

## 1. Architecture overview

```
 Browser (Angular 21 + PrimeNG 21)          URL = full search state (shareable)
        │  /api
        ▼
 nginx ──► NestJS 11 modular monolith ──────────────────────────────────────────┐
           ├─ catalog   owns product, import_run · PIM CSV import (CLI) · GET /products/:sku
           ├─ reviews   owns review · GET/POST /products/:sku/reviews
           ├─ search    owns the Meilisearch index · GET /products (search, facets, sort, paging)
           └─ shared    config · prisma · outbox (publisher + relay)
        │                                   ▲
        ▼                                   │ read model
 PostgreSQL (source of truth) ── outbox_event ──► relay ──► Meilisearch CE
```

- **Postgres is the source of truth; Meilisearch is a derived read model.** Product pages and reviews are served from Postgres and keep working when search is down; search itself falls back to a simpler Postgres query (limited mode) until Meilisearch is back.
- **Modules talk only through a public `index.ts`** (facade + event contracts + domain types). There are no cross-module imports and no cross-module foreign keys (reviews reference products by SKU). An ESLint `no-restricted-imports` rule enforces the boundary.
- **Changes reach the index through a transactional outbox.** The import and the review write insert an `outbox_event` row in the same transaction as the change. A relay claims due events (`FOR UPDATE SKIP LOCKED`, lease, exponential backoff, dead letters after 20 attempts) and calls in-process handlers. Events carry SKUs only; handlers read the current state, so processing is idempotent and order-insensitive.

## 2. Key decisions and alternatives

**Modular monolith, not microservices.** One deployable keeps the first version simple to run and test. Module boundaries, event contracts and the outbox are the seams for a later split: the relay would publish to a broker instead of calling handlers, and `search` would become its own service consuming the same events.

**Meilisearch CE for search.**

| Option | Why not chosen |
|---|---|
| Postgres FTS + `pg_trgm` | Viable at 50k rows, but needs hand-written facet counts and gives weaker typo tolerance. At millions of rows, relevance ranking and facet counting over large match sets get expensive. |
| Typesense | Comparable features and open-source HA, but GPL-3 and the index lives in RAM. |
| OpenSearch / Elasticsearch | Far more operational weight than 50k products justify. |
| ParadeDB `pg_search` | BM25 inside Postgres, but AGPL-3 and a custom Postgres image. |

Meilisearch CE is MIT-licensed, which a corporate legal review accepts more easily than GPL/AGPL. It gives typo tolerance, prefix search and facet distributions out of the box. Its limit is a single node (replication/sharding are Enterprise); because Postgres holds the truth, a lost index is rebuilt with `npm run search:reindex`. The engine sits behind `ProductSearchEngine` / `ProductIndexWriter` ports, so swapping it touches one adapter.

**Search behaviour.**
- Facets are OR within a facet and AND across facets. Certifications are AND, because a customer who needs "Halal + Kosher" needs both.
- Facet counts are disjunctive: one multi-search with an extra query per active facet, so a count shows how many results selecting that value would give.
- Filter values are escaped before they enter Meilisearch filter strings (filter-injection test included).
- Typos are tolerated in words but not in numbers ("SF 470" must not match "SF 471") or SKUs.
- A query that looks like a SKU ("P-10004") requires all terms to match. Otherwise the token "p" matched the whole catalogue. Five alternatives were compared on the real data before choosing this.

**Transactional outbox, not in-process events or direct calls.** Direct calls would make catalog and reviews depend on search. In-process events lose updates if the process dies between commit and indexing. The outbox costs one table and a poller and makes delivery reliable.

**Import: idempotent, conservative, auditable.**
- Each row is normalised, then compared to the stored row by a content hash. Only real changes are written and announced.
- Every run, including aborted ones, is recorded in `import_run` with counters and issues.
- Products missing from the export are delisted, never deleted, so reviews and old links survive.
- Safety guards:
  - a file with no valid rows, or fewer than 50% of the listed catalogue, aborts unless `--force`;
  - a SKU with a rejected row is left untouched rather than delisted;
  - if any row cannot be identified (no SKU), nothing is delisted in that run;
  - a Postgres advisory lock rejects a second concurrent import.
- Writes are batched (`createMany`, `UPDATE … FROM jsonb_to_recordset`) so a full 50k-row change fits the transaction.

**Reviews: the only write flow, public and unauthenticated.**
- Validation runs after cleaning the input (control and bidi characters removed, Unicode normalised, at least one letter or digit, length limits). The database adds a CHECK on rating.
- JSON bodies are limited to 32 kB, and reviews render as plain text only.
- POST is rate-limited per client IP. Only private-network proxies are trusted for `X-Forwarded-For`; nginx overwrites the header, and the backend port is bound to loopback.
- The default limit is 20 per 10 minutes, not 5, because a trade-fair hall often shares one public IPv4 address.

**URL as state.** Query, filters, sort and page live in the URL, which makes "send a colleague a link" and the back button work without extra code. API query parameters match the URL parameters one-to-one. Product pages use `/products/:sku`.

**Comparing products (frontend only).** For "browse and sort … so that I can compare the candidates", customers tick "Compare" on up to three results (or on a product page) and open `/compare?sku=…`, a side-by-side table of availability, rating, attributes and a certification matrix. Rows where all products agree are muted so the differences stand out.
- **Three products**, because three columns still fit on a phone without horizontal scrolling.
- **The URL is the comparison; the selection is personal.** The selection lives in session storage (survives a reload, not a new tab), and the compare URL is what gets shared. Opening a shared comparison does not overwrite the recipient's own selection. Removing a column replaces the URL instead of adding a history entry, so "Back" leaves the comparison instead of bringing the removed product back.
- **No new endpoint.** Each column uses the existing product and reviews endpoints (two requests per product, six at most). A failed product degrades its own column and a failed rating only its cell, not the page; a failed column stays failed until reload, so removing another column never reloads the rest. If the limit grows, a batch endpoint (`GET /products?sku=…`) is the next step.
- **Product cards are no longer one big link.** A checkbox inside a link is invalid HTML and a tap on it would open the product, so the card uses a "stretched link" (the title link's overlay covers the card) with the checkbox above it and a padded label, so a near-miss on a phone does not open the product.
- **Known limit of "Back".** It chooses between browser history and the product list from Angular's `navigationId` when the page opens. A shared-link page revisited with the browser's back button counts as in-app, so "Back" then follows browser history. Tracking the history index (`canceledNavigationResolution: 'computed'`) would fix it, but relies on a private router field.

**Versions chosen on purpose.** Several npm `latest` tags would have broken the build or the brief:
- **NestJS 11, not 12:** Nest 12 packages are ESM-only, and the brief mandates Jest.
- **TypeScript 5.9:** Angular 21 needs `< 6.1`, and `latest` is 7.x.
- **Prisma 7.10:** the `prisma` CLI's `latest` tag points at an 8.0 release candidate.
- **Thin `fetch` client for Meilisearch:** the official SDK is ESM-only; we use about seven endpoints.
- **Angular 21 + PrimeNG 21.1.10, not Angular 22 + PrimeNG 22.** The brief asks for "latest stable" Angular, but PrimeNG 22 (July 2026) moved from MIT to a commercial licence. Without a key it shows a red "Invalid PrimeUI License" banner, and BASF does not qualify for the free community licence. PrimeNG 21 is the last MIT release and requires Angular 21, which is in LTS. Moving to 22 is a licensing decision for the business, not a technical one.

## 3. Assumptions

- **Duplicate SKUs:** the export is in chronological order, so the last row for a SKU wins (P-10151: Active, then Discontinued).
- **Status spelling:** `active`, `ACTIVE`, `Phase out` and `Phase-out` are spelling variants of the three statuses. An unknown status rejects the row.
- **Missing optional data:** a product without a name is still sold, so the SKU is shown as its name. An invalid launch year (`n/a`, empty) is stored as unknown.
- **Missing from the export:** a product absent from the export is no longer offered. It is hidden from search, but its page stays reachable with a "no longer in catalogue" banner, and its reviews become read-only.
- **Discontinued products** are hidden from results by default but can be included with the availability filter. Their page says "no longer sold". This addresses the sales team's complaint about customers asking for products that are no longer sold.
- **Demo reviews** are acceptable in the demo environment. They are seeded idempotently with deterministic IDs and never touch real reviews.
- **The demo stack runs at scale by default.** A 200-product catalogue hides every performance problem, so `docker compose up` seeds 500,000 products: the 202 rows of the PIM export plus deterministic synthetic rows built from its vocabulary, labelled "Synthetic demo product." and kept apart by SKU range (`P-200001` onwards). The cost is a first start of about 5–7 minutes (later starts take seconds), and a manual import of the 202-row export alone is then rejected by the truncation guard, as it should be. `SEED_CATALOG_SIZE=0` gives the plain export.

## 4. Risks and how they are addressed

| Risk | Mitigation | Residual risk |
|---|---|---|
| Truncated or broken PIM export hides the catalogue | 50% guard; mass-change guard (an import that would change or delist more than 30% of the listed catalogue is aborted unless `--force`); untouched-SKU rule; no delisting with unidentifiable rows; `--dry-run` to preview a file; `ABORTED` runs recorded | A plausible-looking export with wrong values below the 30% threshold is applied; previous values are not versioned |
| Search index drifts from the database | Outbox with retries and dead letters; idempotent handlers; `search:verify` exits 1 on a count mismatch or dead/stuck events (for cron and alerting); `search:reindex` rebuilds via an index swap with zero downtime (142 s at 500k products) | `search:verify` compares counts, not content; a wrong value in the index is fixed only by the next change of that product or a reindex |
| Meilisearch outage | Search falls back to Postgres (pg_trgm) within 2 s, flagged `degraded` and shown as "limited mode" in the UI; Meilisearch is retried every 30 s; detail pages and reviews never depend on it; containers restart automatically; events retry for about an hour, then `search:reindex` | Limited mode has no typo tolerance, simpler relevance, no sorting by rating, and does not search certifications or descriptions; at 500k products a search takes 130–375 ms and throughput drops to about 13 searches/s |
| Abusive or offensive reviews (no auth, no moderation) | Validation; links rejected (URLs, `www.` and domains with TLDs common in spam); honeypot field against bots; the same author and text on the same product within 24 h rejected; rate limit; plain-text rendering; `reviews:remove <id>` for operators (the rating in the index follows) | No moderation queue or report button: offensive text stays visible until an operator removes it (next steps). Obfuscated links ("example dot com", other TLDs) get through |
| Rate limit is per process and per IP | Enforced at the nginx edge (`limit_req`), shared by every backend instance behind it; the app throttler stays as a second line and for dev mode | Per IP: users behind one NAT share a budget; several nginx instances would each count separately (shared store or a CDN/WAF rule then) |
| Licence exposure | MIT/Apache components only; PrimeNG pinned to the last MIT version | Moving past PrimeNG 21 is a licensing decision |
| Single Meilisearch node | Automatic restart; the Postgres fallback keeps search working; Postgres is the source of truth, and a full reindex takes about 2.5 min at 500k products | Search quality drops during an outage; HA needs two CE instances fed by the relay, or Meilisearch Cloud/Enterprise |

## 5. Testing strategy

The goal is tests that catch defects, not just pass. Jest is the only test framework (as the brief requires); StrykerJS sits on top of it to measure test strength.

| Layer | What it covers | Where |
|---|---|---|
| Unit (pure logic) | CSV parsing and normalisation, content hash, dedupe, import planning and guards, Meilisearch filter/sort building, facet ordering, query and review validation | `backend/src/**/*.spec.ts` |
| Integration (real Postgres + Meilisearch) | Import idempotency, guards and advisory lock, outbox relay with retries and graceful shutdown, search API including Meilisearch failures (wrong key, timeout, unreachable host, malformed responses), reviews API with sanitising and rate limit, CLI exit codes | `backend/test/*.int-spec.ts`, against the `product_finder_test` database and a separate test index |
| Component (Angular, zoneless) | URL as the source of truth for search state, facets, product page states (ready, discontinued, delisted, 404, error), review form, share button, comparison selection and compare page, API client | `frontend/src/**/*.spec.ts` |

Guard rails:

- **Coverage thresholds** (build fails below): backend integration run ≥ 90 % lines / 75 % branches globally (achieved 96 % / 80 %); backend unit run ≥ 95 % lines / 90 % branches per file for the import and query logic; frontend ≥ 85 % lines / 75 % branches (achieved 96 % / 90 %).
- **Mutation testing** (`npm run test:mutation`, break threshold 75 %): backend scores 100 % on the 13 core-logic files, including the search fallback switch and the synthetic catalogue generator, frontend 100 % on search-query state, status banner, review form and the compare selection and table logic (352 mutants). Where a mutant turned out to be equivalent, the redundant code was removed rather than the mutant disabled; the only line-level disables left are an explicit `relevance` sort case kept for readability and three `<`/`<=` probability thresholds in the synthetic data generator (they differ only if the PRNG returns exactly the threshold), each with its reason. Stryker runs on unit tests only, because the integration suite needs live services and would make mutation runs too slow.
- **Process:** the core logic was written test-first. Integration tests and a few review-driven fixes came after the code; each of those tests was then checked by breaking the code on purpose and confirming the test fails.

**Scale check** (local, Docker Desktop, the default 500k-product stack; reproducible with `node scripts/measure-search.mjs`): import 83 s plus indexing 207 s (1,000 outbox events, no retries); full reindex 142 s; search p50 3–6 ms, page 400 of a broad query about 94 ms; with Meilisearch stopped, the Postgres fallback answers in 130–375 ms per search, but only about 13 searches per second with 10 concurrent clients (p95 1.3 s), because broad queries count facets over hundreds of thousands of rows. That is enough to ride out an outage at this size; a short-lived cache of fallback results would be the next step for a larger catalogue. The check found one real problem: gzip responses from Meilisearch hit Nagle's algorithm and delayed ACKs inside the Docker network and added about 40 ms to most searches. The backend now asks for uncompressed responses (compression gains nothing on an internal network), which cut search latency from about 48 ms to 4 ms.

Not covered: browser end-to-end tests (the brief fixes Jest; the documented `docker compose` smoke run covers the happy path), load testing beyond the local scale check, and contract tests. A Playwright smoke test is the first addition for CI (next steps).

## 6. Deliberately left out, and next steps to production

- **Left out:** authentication, review moderation and reporting, e-mail and contact flows (all out of scope per the brief). Also highlighting of matches, synonyms, multi-language content, semantic search, outbox cleanup, metrics and tracing.
- **Next steps, in rough order:**
  1. Moderation queue and a "report review" action, plus CAPTCHA (e.g. Turnstile) on review submission.
  2. Scheduled PIM pickup (the nightly job calls `npm run catalog:import -- --file …`), with alerting on `ABORTED` / `FAILED` runs and on a failing `search:verify`.
  3. Observability: structured logs, request and relay metrics, health endpoints for orchestration.
  4. CI pipeline running lint, typecheck, unit and integration tests, plus a browser e2e smoke test.
  5. Search quality: synonyms (e.g. "skincare" → "personal care"), searchable region, and later hybrid semantic search.
  6. Outbox housekeeping (purge processed rows), and a broker when the first module is split out.

## 7. Time spent

_To be filled in by the author._
