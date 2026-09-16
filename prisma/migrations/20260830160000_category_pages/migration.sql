ALTER TABLE "categories"
ADD COLUMN "additional_description" TEXT,
ADD COLUMN "offline_redirect_behavior" TEXT NOT NULL DEFAULT 'NOT_FOUND',
ADD COLUMN "redirect_target_category_id" INTEGER;
