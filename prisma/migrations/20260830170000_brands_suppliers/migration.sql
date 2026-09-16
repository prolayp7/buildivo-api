ALTER TABLE "brands" ADD COLUMN "short_description" TEXT, ADD COLUMN "meta_title" TEXT, ADD COLUMN "meta_description" TEXT;
CREATE TABLE "suppliers" (
  "id" SERIAL NOT NULL, "title" TEXT NOT NULL, "slug" TEXT NOT NULL, "description" TEXT, "phone" TEXT, "mobile_phone" TEXT,
  "email" TEXT, "address_line_1" TEXT, "address_line_2" TEXT, "city" TEXT, "county" TEXT, "postcode" TEXT,
  "country_code" TEXT NOT NULL DEFAULT 'GB', "company_number" TEXT, "vat_number" TEXT, "meta_title" TEXT, "meta_description" TEXT,
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "suppliers_slug_key" ON "suppliers"("slug");
ALTER TABLE "products" ADD COLUMN "supplier_id" INTEGER;
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
