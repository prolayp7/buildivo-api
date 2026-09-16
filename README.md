# Buildivo API

NestJS + PostgreSQL + Prisma backend for Buildivo.

## Prerequisites

- Node.js 20+
- PostgreSQL running locally (a local Postgres service listening on `127.0.0.1:5432`)

## Setup

```bash
npm install
# create .env and .env.test (see below for values)
npm run prisma:migrate:deploy
npm run prisma:seed
```

`.env` (gitignored):
```
DATABASE_URL="postgresql://postgres:admin@127.0.0.1:5432/ukshop?schema=public"
```

`.env.test` (gitignored, used only by `npm run test:db`):
```
DATABASE_URL="postgresql://postgres:admin@127.0.0.1:5432/ukshop_test?schema=public"
```

Adjust the username/password/host/port above to match your local Postgres setup — `postgres` / `admin` is simply what this project's local instance uses.

## Common commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run the API in watch mode |
| `npm run prisma:format` | Format `prisma/schema.prisma` |
| `npm run prisma:validate` | Validate the schema |
| `npm run prisma:generate` | Regenerate the Prisma Client |
| `npm run prisma:migrate:dev` | Create + apply a new migration during development |
| `npm run prisma:migrate:deploy` | Apply pending migrations without prompting (e.g. fresh setup, CI) |
| `npm run prisma:migrate:reset -- --force` | Drop, recreate, remigrate, and reseed the dev database from scratch |
| `npm run prisma:seed` | Run `prisma/seed.ts` against the current `DATABASE_URL` |
| `npm run test:db` | Run the database integration test suite against `ukshop_test` |

## Database

The schema is documented in [`docs/superpowers/specs/2026-08-28-database-design.md`](docs/superpowers/specs/2026-08-28-database-design.md) and was implemented via [`docs/superpowers/plans/2026-08-28-database-design.md`](docs/superpowers/plans/2026-08-28-database-design.md).

## Buildivo catalog seed

```bash
npm run test:seed            # offline fixture and repeat-run checks; no database needed
npm run prisma:seed:catalog  # creates the catalog in DATABASE_URL
```

The catalog-only command seeds these four areas without running the full seed's
legacy homepage/blog/account fixtures:

- 15 categories: the storefront's 10 departments and 5 Power Tools subcategories.
- 10 brands, preserving actual prototype brand/model pairings (Bosch Pro is grouped under Bosch).
- 35 specification/kit attributes with values and variant assignments.
- 18 demo products: 17 standard products and one variable product, 20 variants total.
  Includes VAT-inclusive GBP prices, sale prices, known demo stock, quantity tiers,
  local product media, box-content FAQs and same-category related products.
  Active shipping methods are linked when present. The full seed creates those first.

Source: a committed snapshot of `buildivo-store-design/src/data/categories.ts`
and `src/data/products.ts`, stored in `prisma/fixtures/buildivo-catalog.json`.
No sibling checkout or network fetch is needed at seed time. Local JPEGs are copied
from `prisma/fixtures/images` to `MEDIA_UPLOAD_DIR` (default `./uploads`) without
replacing existing files. Empty and externally hosted prototype images are omitted.

This is development/demo data, not verified manufacturer or live inventory data.
Unknown stock is zero; alternate kits have zero stock rather than duplicating the
parent's quantity. No invented GTIN/UPC, warranty, supplier, ratings, reviews or
compatibility claims are added. Products are not search-indexable by default.
Departments without source products intentionally remain empty. Additional products
should be added from approved catalog data, not fabricated model combinations.

Catalog database writes run in a transaction. Repeat runs preserve existing
categories, brands, product edits, variant prices, stock and archived products;
existing products are skipped as a whole. This is a bootstrap seed, not a catalog
synchronisation or repair command. Files copied before a failed transaction can
remain in the upload directory and are safely reused by a subsequent run.

Old computer-shop records are **not deleted**. A nested `storage` category is treated
as a legacy computer-storage collision and stops the catalog seed before it writes.
Migrate or archive legacy catalog records separately before seeding an existing shop;
never reset a database containing orders or other records you need to keep.
The full `prisma:seed` also calls this catalog seed, but its unrelated legacy
homepage/blog fixtures are outside this catalog update; use the catalog-only command
when updating these four areas.
