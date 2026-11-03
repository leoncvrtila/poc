-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'PHASE_OUT', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "ImportOutcome" AS ENUM ('SUCCEEDED', 'ABORTED', 'FAILED');

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT,
    "chemical_name" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "application_area" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "certifications" TEXT[],
    "status" "ProductStatus" NOT NULL,
    "launch_year" INTEGER,
    "description" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_run" (
    "id" UUID NOT NULL,
    "source_file" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "outcome" "ImportOutcome" NOT NULL,
    "message" TEXT,
    "rows_read" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "delisted" INTEGER NOT NULL,
    "relisted" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,

    CONSTRAINT "import_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" UUID NOT NULL,
    "product_sku" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");

-- CreateIndex
CREATE INDEX "import_run_outcome_finished_at_idx" ON "import_run"("outcome", "finished_at");

-- CreateIndex
CREATE INDEX "review_product_sku_created_at_idx" ON "review"("product_sku", "created_at");

-- Ratings are 1–5 even if a future writer bypasses API validation.
ALTER TABLE "review" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- The relay only scans pending events.
CREATE INDEX "outbox_event_pending_idx" ON "outbox_event" ("available_at", "id") WHERE "processed_at" IS NULL;
