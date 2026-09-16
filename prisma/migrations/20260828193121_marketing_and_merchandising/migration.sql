-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "BannerLinkType" AS ENUM ('PRODUCT', 'CATEGORY', 'BRAND', 'CUSTOM_URL');

-- CreateEnum
CREATE TYPE "FeaturedSectionType" AS ENUM ('NEWLY_ADDED', 'FEATURED', 'BEST_SELLER', 'TOP_RATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "MenuLocation" AS ENUM ('HEADER', 'FOOTER');

-- CreateTable
CREATE TABLE "coupons" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL,
    "applies_to_shipping" BOOLEAN NOT NULL DEFAULT false,
    "min_order_total" DECIMAL(10,2),
    "max_discount_value" DECIMAL(10,2),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "max_total_usage" INTEGER,
    "max_usage_per_user" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_coupon_lines" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "coupon_id" INTEGER NOT NULL,
    "coupon_code" TEXT NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_coupon_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "link_type" "BannerLinkType" NOT NULL,
    "product_id" INTEGER,
    "category_id" INTEGER,
    "brand_id" INTEGER,
    "custom_url" TEXT,
    "position" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_sections" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "section_type" "FeaturedSectionType" NOT NULL,
    "category_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "featured_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_section_products" (
    "featured_section_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "featured_section_products_pkey" PRIMARY KEY ("featured_section_id","product_id")
);

-- CreateTable
CREATE TABLE "hero_slides" (
    "id" SERIAL NOT NULL,
    "headline" TEXT NOT NULL,
    "subheading" TEXT,
    "cta_label" TEXT,
    "cta_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_trust_badges" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "hero_trust_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "location" "MenuLocation" NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" SERIAL NOT NULL,
    "menu_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "label" TEXT NOT NULL,
    "href" TEXT,
    "category_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mega_menu_panels" (
    "id" SERIAL NOT NULL,
    "menu_item_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mega_menu_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mega_menu_columns" (
    "id" SERIAL NOT NULL,
    "panel_id" INTEGER NOT NULL,
    "title" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mega_menu_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mega_menu_links" (
    "id" SERIAL NOT NULL,
    "column_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "category_id" INTEGER,
    "href" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mega_menu_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "order_coupon_lines_order_id_key" ON "order_coupon_lines"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "banners_slug_key" ON "banners"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "featured_sections_slug_key" ON "featured_sections"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "menus_slug_key" ON "menus"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "mega_menu_panels_menu_item_id_key" ON "mega_menu_panels"("menu_item_id");

-- AddForeignKey
ALTER TABLE "order_coupon_lines" ADD CONSTRAINT "order_coupon_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_coupon_lines" ADD CONSTRAINT "order_coupon_lines_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_sections" ADD CONSTRAINT "featured_sections_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_section_products" ADD CONSTRAINT "featured_section_products_featured_section_id_fkey" FOREIGN KEY ("featured_section_id") REFERENCES "featured_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_section_products" ADD CONSTRAINT "featured_section_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mega_menu_panels" ADD CONSTRAINT "mega_menu_panels_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mega_menu_columns" ADD CONSTRAINT "mega_menu_columns_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "mega_menu_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mega_menu_links" ADD CONSTRAINT "mega_menu_links_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "mega_menu_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mega_menu_links" ADD CONSTRAINT "mega_menu_links_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
