-- DropIndex
DROP INDEX "brands_title_trgm_idx";

-- DropIndex
DROP INDEX "categories_title_trgm_idx";

-- DropIndex
DROP INDEX "products_sku_trgm_idx";

-- DropIndex
DROP INDEX "products_title_trgm_idx";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tool_platform" TEXT;

-- CreateIndex
CREATE INDEX "products_tool_platform_idx" ON "products"("tool_platform");
