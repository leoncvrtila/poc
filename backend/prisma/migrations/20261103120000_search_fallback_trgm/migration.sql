-- Fallback search, used when Meilisearch is unavailable (see CatalogFacade.searchProducts).
-- Expression index: schema.prisma cannot express it, so a future `prisma migrate dev` may propose dropping it. Keep it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS product_search_text_trgm_idx ON product USING gin (
  (lower(coalesce(name, '') || ' ' || chemical_name || ' ' || sku || ' ' || "function" || ' ' || application_area)) gin_trgm_ops
);
