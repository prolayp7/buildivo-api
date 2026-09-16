ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'FREE_SHIPPING';
ALTER TABLE "coupons" ADD COLUMN "name" TEXT;
UPDATE "coupons" SET "name" = "code" WHERE "name" IS NULL;
ALTER TABLE "coupons" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "coupons" ADD COLUMN "target_type" TEXT NOT NULL DEFAULT 'ALL', ADD COLUMN "target_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], ADD COLUMN "exclude_sale_items" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE';
CREATE TABLE "automatic_discounts" ("id" SERIAL NOT NULL,"name" TEXT NOT NULL,"description" TEXT,"discount_type" "DiscountType" NOT NULL,"discount_amount" DECIMAL(10,2) NOT NULL,"target_type" TEXT NOT NULL,"target_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],"starts_at" TIMESTAMP(3),"ends_at" TIMESTAMP(3),"show_sale_badge" BOOLEAN NOT NULL DEFAULT true,"status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',"deleted_at" TIMESTAMP(3),"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL,CONSTRAINT "automatic_discounts_pkey" PRIMARY KEY ("id"));
INSERT INTO "permissions" ("key", "description") VALUES ('marketing.manage', 'Manage discounts and promotions') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id") SELECT r.id,p.id FROM "roles" r CROSS JOIN "permissions" p WHERE r.name='Super Admin' AND p.key='marketing.manage' ON CONFLICT DO NOTHING;
