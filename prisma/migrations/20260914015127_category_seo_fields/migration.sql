-- CreateEnum
CREATE TYPE "TwitterCardType" AS ENUM ('SUMMARY', 'SUMMARY_LARGE_IMAGE');

-- CreateEnum
CREATE TYPE "PageSchemaType" AS ENUM ('AUTOMATIC', 'CUSTOM');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "custom_schema" TEXT,
ADD COLUMN     "meta_keywords" TEXT,
ADD COLUMN     "og_description" TEXT,
ADD COLUMN     "og_image" TEXT,
ADD COLUMN     "og_image_alt" TEXT,
ADD COLUMN     "og_title" TEXT,
ADD COLUMN     "page_header" TEXT,
ADD COLUMN     "schema_type" "PageSchemaType" NOT NULL DEFAULT 'AUTOMATIC',
ADD COLUMN     "twitter_card" "TwitterCardType" NOT NULL DEFAULT 'SUMMARY_LARGE_IMAGE',
ADD COLUMN     "twitter_description" TEXT,
ADD COLUMN     "twitter_image" TEXT,
ADD COLUMN     "twitter_title" TEXT;

-- CreateTable
CREATE TABLE "category_faqs" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "category_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_faqs_category_id_idx" ON "category_faqs"("category_id");

-- AddForeignKey
ALTER TABLE "category_faqs" ADD CONSTRAINT "category_faqs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

