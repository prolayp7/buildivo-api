-- Existing rows are leftover generic template seed data (PC-parts copy),
-- not real buildivo content - safe to clear before reshaping the table.
DELETE FROM "hero_slides";

ALTER TABLE "hero_slides" DROP COLUMN "headline";
ALTER TABLE "hero_slides" DROP COLUMN "subheading";
ALTER TABLE "hero_slides" DROP COLUMN "tone";
ALTER TABLE "hero_slides" DROP COLUMN "cta_url";
ALTER TABLE "hero_slides" DROP COLUMN "secondary_cta_label";
ALTER TABLE "hero_slides" DROP COLUMN "secondary_cta_url";
DROP TYPE "HeroSlideTone";

ALTER TABLE "hero_slides" ADD COLUMN "heading" TEXT NOT NULL DEFAULT '';
ALTER TABLE "hero_slides" ALTER COLUMN "heading" DROP DEFAULT;
ALTER TABLE "hero_slides" ADD COLUMN "highlight" TEXT;
ALTER TABLE "hero_slides" ADD COLUMN "ending" TEXT;
ALTER TABLE "hero_slides" ADD COLUMN "description" TEXT;
ALTER TABLE "hero_slides" ADD COLUMN "overlay_badge" TEXT;
ALTER TABLE "hero_slides" ADD COLUMN "specification" TEXT;
ALTER TABLE "hero_slides" ADD COLUMN "image_alt" TEXT;
ALTER TABLE "hero_slides" ADD COLUMN "image_fit" TEXT DEFAULT 'cover';
ALTER TABLE "hero_slides" ADD COLUMN "link_type" "BannerLinkType" NOT NULL DEFAULT 'CUSTOM_URL';
ALTER TABLE "hero_slides" ADD COLUMN "product_id" INTEGER;
ALTER TABLE "hero_slides" ADD COLUMN "category_id" INTEGER;
ALTER TABLE "hero_slides" ADD COLUMN "custom_url" TEXT;

ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "hero_slides_product_id_idx" ON "hero_slides"("product_id");
CREATE INDEX "hero_slides_category_id_idx" ON "hero_slides"("category_id");
