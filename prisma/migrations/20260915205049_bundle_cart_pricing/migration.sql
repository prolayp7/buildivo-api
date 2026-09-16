-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "bundle_id" INTEGER,
ADD COLUMN     "unit_price_override" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "product_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
