-- CreateEnum
CREATE TYPE "TrendingPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "search_logs" (
    "id" SERIAL NOT NULL,
    "query" TEXT NOT NULL,
    "result_count" INTEGER NOT NULL,
    "entity_types" JSONB,
    "user_id" INTEGER,
    "session_id" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trending_products" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "period" "TrendingPeriod" NOT NULL,
    "search_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "sale_count" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trending_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trending_products_product_id_period_computed_at_idx" ON "trending_products"("product_id", "period", "computed_at");

-- AddForeignKey
ALTER TABLE "trending_products" ADD CONSTRAINT "trending_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
