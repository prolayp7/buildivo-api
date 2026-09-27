ALTER TABLE "products"
ADD COLUMN "social_share_image" TEXT;

CREATE TABLE "product_slug_redirects" (
    "id" SERIAL NOT NULL,
    "old_slug" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_slug_redirects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_slug_redirects_old_slug_key"
ON "product_slug_redirects"("old_slug");

CREATE INDEX "product_slug_redirects_product_id_idx"
ON "product_slug_redirects"("product_id");

ALTER TABLE "product_slug_redirects"
ADD CONSTRAINT "product_slug_redirects_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;