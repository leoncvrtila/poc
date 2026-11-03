# Product Finder

A product catalogue browser for a chemicals portfolio: full-text search with filters, product detail pages and customer reviews. The catalogue is imported from a PIM CSV export into PostgreSQL and indexed in Meilisearch; the UI is an Angular single-page app served by nginx.

## Prerequisites

- Docker Desktop (Compose v2) - enough to run everything.
- Node 24 + npm - only for development mode and tests.

## Quick start

```bash
docker compose up --build
```

Then open:

- App: http://localhost:8080
- API docs (Swagger): http://localhost:8080/api/docs

The first start builds the images, applies the database migrations, seeds a **500,000-product catalogue** and inserts demo reviews. It takes about 5–7 minutes (the UI is up once Meilisearch has indexed everything; `docker compose logs -f backend-init` shows progress); later starts take seconds, because the seed finds every row unchanged.

The catalogue is the 202 rows of `data/products.csv` (the PIM export) plus synthetic products generated from its vocabulary, to show search at a realistic scale. Synthetic products have SKUs from `P-200001` and descriptions starting with "Synthetic demo product."; demo reviews are only on the real products. For the PIM export alone, start on a fresh volume with:

```bash
SEED_CATALOG_SIZE=0 docker compose up --build
```

Host ports can be overridden with environment variables (or a `.env` file next to `docker-compose.yml`): `POSTGRES_PORT`, `MEILI_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`. Postgres, Meilisearch and the backend are published on `127.0.0.1` only; public traffic goes through nginx.

## Data loading

The one-shot `backend-init` service runs on every `docker compose up` and is idempotent:

1. `npx prisma migrate deploy` - applies pending migrations.
2. `node dist/cli.js seed` - imports `data/products.csv` (the PIM export) plus synthetic products up to `SEED_CATALOG_SIZE` (500,000 in Docker Compose, 0 = none) and indexes everything in Meilisearch. The synthetic rows are deterministic, so re-running the seed reports every row as `unchanged`.
3. `node dist/cli.js demo-reviews` - inserts demo reviews (skipped with `SEED_DEMO_REVIEWS=false`).

Manual commands (run in `backend/`, or inside the stack, e.g. `docker compose run --rm backend-init node dist/cli.js reindex`):

```bash
npm run db:seed                                     # import data/products.csv (+ synthetic rows up to SEED_CATALOG_SIZE)
npm run catalog:import -- --file <path> [--force]   # import any PIM export
npm run catalog:import -- --file <path> --dry-run   # show what an import would change, write nothing
npm run seed:demo-reviews                           # demo reviews
npm run search:reindex                              # rebuild the Meilisearch index from Postgres
npm run search:verify                               # compare index and database; exit code 1 on drift
npm run reviews:remove -- <review id>               # remove an abusive review (the product rating follows)
```

Guarantees:

- Importing the same file again reports every row as `unchanged`; nothing is rewritten.
- Products missing from a new export are marked delisted, not deleted; reviews are kept.
- An export with fewer valid rows than 50% of the listed catalogue is rejected as truncated unless `--force` is given.
- An export that would change or delist more than 30% of the listed catalogue is rejected unless `--force` is given; `--dry-run` shows the numbers first.
- A product whose row is rejected (e.g. unknown status) is left unchanged, never delisted; if any row has no SKU, nothing is delisted in that run.
- A second import started while one is running is rejected (Postgres advisory lock). Every run, including aborted ones, is recorded in the `import_run` table.
- Demo reviews are inserted only once; re-running inserts 0 and never touches reviews submitted through the UI.

With the default 500,000-product catalogue, importing `data/products.csv` on its own (`npm run catalog:import -- --file ../data/products.csv`) is rejected by the truncation guard: 202 rows against 500,000 listed products looks exactly like a broken export. That is the guard working. To try the import guarantees on the plain export, start with `SEED_CATALOG_SIZE=0` on a fresh volume (`docker compose down -v` first), or pass `--force`. Going back from 500,000 to 200 products also needs `docker compose down -v`.

A nightly PIM delivery would simply drop the new file somewhere the backend can read and run `npm run catalog:import -- --file <path>` (for example from a cron job or scheduled container).

## Development mode

Start the infrastructure only (if the full stack is running, stop its app containers first with `docker compose stop backend frontend`, since the dev backend also uses port 3000):

```bash
docker compose up -d postgres meilisearch
```

Backend (http://localhost:3000, docs at `/api/docs`):

```bash
cd backend
cp .env.example .env
npm ci
npx prisma migrate deploy
npm run build
npm run db:seed
npm run start:dev
```

Frontend (http://localhost:4200, `/api` is proxied to the backend on port 3000):

```bash
cd frontend
npm ci
npm start
```

## Tests

```bash
cd backend
npm test                # unit tests
npm run test:cov        # unit tests + coverage thresholds
npm run test:int        # integration tests; needs postgres + meilisearch running
npm run test:int:cov    # integration tests + coverage thresholds
npm run test:mutation   # StrykerJS mutation testing of the core logic (HTML report in reports/mutation/)
npm run lint
npm run typecheck

cd ../frontend
npm test
npm run test:cov
npm run test:mutation
```

Search latency against the running stack (sequential runs per query type, then 10 concurrent clients):

```bash
node scripts/measure-search.mjs              # default http://localhost:8080, 50 runs per query
```

The integration tests use the `product_finder_test` database (created automatically by `docker/postgres/init` when the Postgres volume is first initialised) and a separate test index in Meilisearch.

## Project layout

```
.
├── docker-compose.yml        postgres, meilisearch, backend-init, backend, frontend
├── data/products.csv         PIM export used for seeding
├── docker/postgres/init/     creates the integration-test database
├── scripts/                  measure-search.mjs: search latency against the running stack
├── backend/                  NestJS 11 modular monolith
│   ├── prisma/               schema and migrations
│   ├── src/modules/catalog   products, CSV import, catalogue API
│   ├── src/modules/reviews   reviews API and demo data
│   ├── src/modules/search    Meilisearch indexing and search API
│   ├── src/shared/           config, outbox relay, prisma, utilities
│   ├── src/cli.ts            seed | import | demo-reviews | reindex
│   └── test/                 integration tests
├── frontend/                 Angular 21 + PrimeNG 21, nginx.conf for the container
├── DECISIONS.md              architecture, decisions, assumptions, risks
└── AI_USAGE.md               how AI tools were used
```

## Troubleshooting

- **Port already in use**: override the host port, e.g. `POSTGRES_PORT=5433 FRONTEND_PORT=8081 docker compose up --build`. A local PostgreSQL on 5432 is the usual culprit for `POSTGRES_PORT`; in development mode also update `DATABASE_URL` in `backend/.env`. The same applies to `MEILI_PORT` and `BACKEND_PORT`.
- **Start from an empty database**: `docker compose down -v` removes the Postgres and Meilisearch volumes; the next `up` re-imports everything.
- **"Search is running in limited mode"**: Meilisearch is down or unreachable, so search is served from Postgres (no typo tolerance, simpler ranking, no sorting by rating; certifications and descriptions are not searched, but can still be filtered). Meilisearch is retried every 30 seconds and normal search returns on its own; pending index updates are retried automatically. Search returns 503 only if Postgres is unavailable too.
- **Check that the search index matches the database**: `npm run search:verify` (exit code 1 on a mismatch or failed index updates; then run `npm run search:reindex`).
- **Search results are stale after a long Meilisearch outage**: run `npm run search:reindex` to rebuild the index from Postgres.

## More

- [DECISIONS.md](DECISIONS.md) - architecture, key decisions, assumptions, risks, testing strategy, next steps.
- [AI_USAGE.md](AI_USAGE.md) - how AI assistance was used.
