-- Adds original/thumbnail URL columns for the new products/originals|thumbnails|optimized
-- storage layout. Existing rows keep these null until re-uploaded.
ALTER TABLE "media" ADD COLUMN "original_url" TEXT;
ALTER TABLE "media" ADD COLUMN "thumbnail_url" TEXT;
