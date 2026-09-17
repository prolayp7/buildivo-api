-- Fuzzy/typo-tolerant product search: trigram similarity on title, brand
-- and category name, so glued words ("uvexsafety") and typos/missing
-- letters ("uvexsafet") can still match, not just exact substrings.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_title_trgm_idx ON products USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_sku_trgm_idx ON products USING GIN (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS brands_title_trgm_idx ON brands USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS categories_title_trgm_idx ON categories USING GIN (title gin_trgm_ops);
