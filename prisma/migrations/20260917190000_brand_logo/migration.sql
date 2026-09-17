-- Brand logo image, matching Category's cover/thumbnail image pattern
-- (a plain URL column, populated via the admin's generic library upload).
ALTER TABLE "brands" ADD COLUMN "logo" TEXT;
ALTER TABLE "brands" ADD COLUMN "logo_alt" TEXT;
