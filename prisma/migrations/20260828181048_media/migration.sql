-- CreateEnum
CREATE TYPE "MediaOwnerType" AS ENUM ('PRODUCT', 'PRODUCT_VARIANT', 'CATEGORY', 'BRAND', 'BLOG_POST', 'BLOG_CATEGORY', 'AUTHOR', 'PAGE', 'BANNER', 'TESTIMONIAL', 'HERO_SLIDE', 'USER', 'REVIEW', 'ORDER_ITEM_RETURN');

-- CreateTable
CREATE TABLE "media" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "owner_type" "MediaOwnerType" NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "collection" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_uuid_key" ON "media"("uuid");

-- CreateIndex
CREATE INDEX "media_owner_type_owner_id_collection_idx" ON "media"("owner_type", "owner_id", "collection");
