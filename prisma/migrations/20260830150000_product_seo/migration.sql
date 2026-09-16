ALTER TABLE "products"
ADD COLUMN "seo_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "offline_redirect_behavior" TEXT NOT NULL DEFAULT 'NOT_FOUND',
ADD COLUMN "redirect_target_category_id" INTEGER;
