CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'VARIABLE');
ALTER TABLE "products" ADD COLUMN "product_type" "ProductType" NOT NULL DEFAULT 'STANDARD';
CREATE INDEX "products_product_type_status_idx" ON "products"("product_type", "status");
