ALTER TABLE "products"
ADD COLUMN "delivery_time_mode" TEXT NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN "in_stock_delivery_time" TEXT,
ADD COLUMN "out_of_stock_delivery_time" TEXT,
ADD COLUMN "additional_shipping_cost" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE "product_shipping_methods" (
  "product_id" INTEGER NOT NULL,
  "shipping_method_id" INTEGER NOT NULL,
  CONSTRAINT "product_shipping_methods_pkey" PRIMARY KEY ("product_id", "shipping_method_id")
);

CREATE INDEX "product_shipping_methods_shipping_method_id_idx" ON "product_shipping_methods"("shipping_method_id");
ALTER TABLE "product_shipping_methods" ADD CONSTRAINT "product_shipping_methods_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_shipping_methods" ADD CONSTRAINT "product_shipping_methods_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
