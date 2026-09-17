-- Realign HomepageSectionType with the storefront's actual homepage
-- sections. The table was cleared before this migration (legacy
-- placeholder rows only), so the enum swap is safe.
ALTER TYPE "HomepageSectionType" RENAME TO "HomepageSectionType_old";
CREATE TYPE "HomepageSectionType" AS ENUM ('HERO', 'TRUST_STRIP', 'DEPARTMENTS', 'FEATURED_PRODUCTS', 'PROJECT_KITS', 'TRADE_CTA', 'CALCULATORS', 'ECOSYSTEM_MATCHER');
ALTER TABLE "homepage_sections" ALTER COLUMN "type" TYPE "HomepageSectionType" USING ("type"::text::"HomepageSectionType");
DROP TYPE "HomepageSectionType_old";
