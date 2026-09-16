-- CreateEnum
CREATE TYPE "HomepageSectionType" AS ENUM ('HERO', 'TRUST_STRIP', 'DEALS', 'FEATURED_PRODUCTS', 'NEW_ARRIVALS', 'BRANDS', 'TESTIMONIALS', 'BLOG_HIGHLIGHTS', 'FAQS', 'BANNERS', 'NEWSLETTER');

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" SERIAL NOT NULL,
    "type" "HomepageSectionType" NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);
