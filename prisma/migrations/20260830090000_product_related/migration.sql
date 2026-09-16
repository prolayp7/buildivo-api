CREATE TABLE "product_related" (
    "product_id" INTEGER NOT NULL,
    "related_product_id" INTEGER NOT NULL,

    CONSTRAINT "product_related_pkey" PRIMARY KEY ("product_id", "related_product_id")
);

CREATE INDEX "product_related_related_product_id_idx" ON "product_related"("related_product_id");

ALTER TABLE "product_related" ADD CONSTRAINT "product_related_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_related" ADD CONSTRAINT "product_related_related_product_id_fkey"
FOREIGN KEY ("related_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_related" ADD CONSTRAINT "product_related_no_self_relation"
CHECK ("product_id" <> "related_product_id");
