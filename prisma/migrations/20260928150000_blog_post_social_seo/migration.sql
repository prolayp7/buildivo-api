ALTER TABLE "blog_posts"
ADD COLUMN "social_share_image" TEXT,
ADD COLUMN "social_share_image_alt" TEXT,
ADD COLUMN "twitter_card" "TwitterCardType" NOT NULL DEFAULT 'SUMMARY_LARGE_IMAGE';
