-- Adds a caption (two-line badges, e.g. "Sub-2hr Click & Collect" /
-- "Available across 240 branches") and a placement so the same
-- HeroTrustBadge model can drive both the homepage trust strip and the
-- single floating badge over the hero image.
CREATE TYPE "HeroTrustBadgePlacement" AS ENUM ('TRUST_STRIP', 'HERO_FLOATING');

ALTER TABLE "hero_trust_badges" ADD COLUMN "caption" TEXT;
ALTER TABLE "hero_trust_badges" ADD COLUMN "placement" "HeroTrustBadgePlacement" NOT NULL DEFAULT 'TRUST_STRIP';
