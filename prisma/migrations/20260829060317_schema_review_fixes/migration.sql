/*
  Warnings:

  - A unique constraint covering the columns `[user_id,slug]` on the table `wishlists` will be added. If there are existing duplicate values, this will fail.

*/

-- ============================================================================
-- HAND-WRITTEN SECTION (final whole-branch review, Finding 1)
-- ----------------------------------------------------------------------------
-- The 10 columns below belong to soft-deletable models (they have a
-- `deleted_at` column). Prisma's `@unique` attribute always produces a
-- GLOBAL unique index, which means a soft-deleted row's natural key (email,
-- slug, sku, barcode, code, ...) can never be reused by a new row, since the
-- old row's key still counts toward uniqueness.
--
-- Prisma's schema DSL cannot express a partial index, so we dropped the
-- plain `@unique` attribute from these fields in schema.prisma and instead
-- hand-write the equivalent PARTIAL unique index here, scoped to
-- `WHERE "deleted_at" IS NULL`. This preserves uniqueness among *live* rows
-- only, so re-creating a row with the same key as a soft-deleted one is
-- allowed. Index names intentionally match Prisma's default `<table>_<col>_key`
-- naming convention so a future `prisma db pull`/diff does not see these as
-- unmanaged/unexpected indexes.
-- ============================================================================

-- DropIndex
DROP INDEX "admin_users_email_key";
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "categories_slug_key";
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "coupons_code_key";
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "product_attributes_slug_key";
CREATE UNIQUE INDEX "product_attributes_slug_key" ON "product_attributes"("slug") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "product_variants_barcode_key";
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "product_variants_slug_key";
CREATE UNIQUE INDEX "product_variants_slug_key" ON "product_variants"("slug") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "products_sku_key";
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "products_slug_key";
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email") WHERE "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "users_phone_key";
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone") WHERE "deleted_at" IS NULL;

-- ============================================================================
-- END HAND-WRITTEN SECTION. Everything below is Prisma-generated (Finding 2:
-- missing FK indexes, and Finding 4: Wishlist.slug uniqueness per user).
-- ============================================================================

-- CreateIndex
CREATE INDEX "admin_users_role_id_idx" ON "admin_users"("role_id");

-- CreateIndex
CREATE INDEX "banners_product_id_idx" ON "banners"("product_id");

-- CreateIndex
CREATE INDEX "banners_category_id_idx" ON "banners"("category_id");

-- CreateIndex
CREATE INDEX "banners_brand_id_idx" ON "banners"("brand_id");

-- CreateIndex
CREATE INDEX "blog_posts_blog_category_id_idx" ON "blog_posts"("blog_category_id");

-- CreateIndex
CREATE INDEX "blog_posts_author_id_idx" ON "blog_posts"("author_id");

-- CreateIndex
CREATE INDEX "browsing_history_product_id_idx" ON "browsing_history"("product_id");

-- CreateIndex
CREATE INDEX "cart_items_product_variant_id_idx" ON "cart_items"("product_variant_id");

-- CreateIndex
CREATE INDEX "category_products_product_id_idx" ON "category_products"("product_id");

-- CreateIndex
CREATE INDEX "collection_products_product_id_idx" ON "collection_products"("product_id");

-- CreateIndex
CREATE INDEX "faqs_faq_category_id_idx" ON "faqs"("faq_category_id");

-- CreateIndex
CREATE INDEX "featured_section_products_product_id_idx" ON "featured_section_products"("product_id");

-- CreateIndex
CREATE INDEX "featured_sections_category_id_idx" ON "featured_sections"("category_id");

-- CreateIndex
CREATE INDEX "gift_card_transactions_gift_card_id_idx" ON "gift_card_transactions"("gift_card_id");

-- CreateIndex
CREATE INDEX "gift_card_transactions_order_id_idx" ON "gift_card_transactions"("order_id");

-- CreateIndex
CREATE INDEX "gift_cards_purchased_by_user_id_idx" ON "gift_cards"("purchased_by_user_id");

-- CreateIndex
CREATE INDEX "mega_menu_columns_panel_id_idx" ON "mega_menu_columns"("panel_id");

-- CreateIndex
CREATE INDEX "mega_menu_links_column_id_idx" ON "mega_menu_links"("column_id");

-- CreateIndex
CREATE INDEX "mega_menu_links_category_id_idx" ON "mega_menu_links"("category_id");

-- CreateIndex
CREATE INDEX "menu_items_menu_id_idx" ON "menu_items"("menu_id");

-- CreateIndex
CREATE INDEX "menu_items_parent_id_idx" ON "menu_items"("parent_id");

-- CreateIndex
CREATE INDEX "menu_items_category_id_idx" ON "menu_items"("category_id");

-- CreateIndex
CREATE INDEX "order_coupon_lines_coupon_id_idx" ON "order_coupon_lines"("coupon_id");

-- CreateIndex
CREATE INDEX "order_item_returns_order_item_id_idx" ON "order_item_returns"("order_item_id");

-- CreateIndex
CREATE INDEX "order_item_returns_user_id_idx" ON "order_item_returns"("user_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_product_variant_id_idx" ON "order_items"("product_variant_id");

-- CreateIndex
CREATE INDEX "order_status_history_changed_by_admin_id_idx" ON "order_status_history"("changed_by_admin_id");

-- CreateIndex
CREATE INDEX "orders_shipping_method_id_idx" ON "orders"("shipping_method_id");

-- CreateIndex
CREATE INDEX "payment_disputes_transaction_id_idx" ON "payment_disputes"("transaction_id");

-- CreateIndex
CREATE INDEX "payment_disputes_order_id_idx" ON "payment_disputes"("order_id");

-- CreateIndex
CREATE INDEX "payment_refunds_transaction_id_idx" ON "payment_refunds"("transaction_id");

-- CreateIndex
CREATE INDEX "payment_refunds_order_id_idx" ON "payment_refunds"("order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_order_id_idx" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "product_faqs_product_id_idx" ON "product_faqs"("product_id");

-- CreateIndex
CREATE INDEX "product_variant_attributes_attribute_id_idx" ON "product_variant_attributes"("attribute_id");

-- CreateIndex
CREATE INDEX "product_variant_attributes_attribute_value_id_idx" ON "product_variant_attributes"("attribute_value_id");

-- CreateIndex
CREATE INDEX "products_product_condition_id_idx" ON "products"("product_condition_id");

-- CreateIndex
CREATE INDEX "products_tax_rate_id_idx" ON "products"("tax_rate_id");

-- CreateIndex
CREATE INDEX "reviews_order_id_idx" ON "reviews"("order_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "shipping_rate_bands_shipping_method_id_idx" ON "shipping_rate_bands"("shipping_method_id");

-- CreateIndex
CREATE INDEX "wishlist_items_product_variant_id_idx" ON "wishlist_items"("product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_user_id_slug_key" ON "wishlists"("user_id", "slug");
