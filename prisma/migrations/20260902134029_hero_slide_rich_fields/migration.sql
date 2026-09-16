-- CreateEnum
CREATE TYPE "HeroSlideTone" AS ENUM ('VIOLET', 'ELECTRIC', 'CYAN', 'CRIMSON');

-- AlterTable
ALTER TABLE "hero_slides" ADD COLUMN     "eyebrow" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "image_position" TEXT DEFAULT 'center',
ADD COLUMN     "secondary_cta_label" TEXT,
ADD COLUMN     "secondary_cta_url" TEXT,
ADD COLUMN     "tone" "HeroSlideTone" NOT NULL DEFAULT 'VIOLET';
