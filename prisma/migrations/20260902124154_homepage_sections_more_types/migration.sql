-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HomepageSectionType" ADD VALUE 'CATEGORY_SHOWCASE';
ALTER TYPE "HomepageSectionType" ADD VALUE 'SHOP_BY_NEED';
ALTER TYPE "HomepageSectionType" ADD VALUE 'GAMING_SHOWCASE';
ALTER TYPE "HomepageSectionType" ADD VALUE 'LAPTOP_SHOWCASE';
ALTER TYPE "HomepageSectionType" ADD VALUE 'BUYING_GUIDES';
ALTER TYPE "HomepageSectionType" ADD VALUE 'SEO_INTRO';
