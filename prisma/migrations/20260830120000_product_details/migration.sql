ALTER TABLE "products"
ADD COLUMN "gtin" VARCHAR(14),
ADD COLUMN "upc" VARCHAR(12),
ADD COLUMN "allow_customization" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "customization_instructions" TEXT;
