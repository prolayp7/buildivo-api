CREATE TABLE "product_compatibility_links" (
    "product_id" INTEGER NOT NULL,
    "compatible_product_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_compatibility_links_pkey" PRIMARY KEY ("product_id", "compatible_product_id")
);

CREATE INDEX "product_compatibility_links_compatible_product_id_idx" ON "product_compatibility_links"("compatible_product_id");

ALTER TABLE "product_compatibility_links" ADD CONSTRAINT "product_compatibility_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_compatibility_links" ADD CONSTRAINT "product_compatibility_links_compatible_product_id_fkey" FOREIGN KEY ("compatible_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;