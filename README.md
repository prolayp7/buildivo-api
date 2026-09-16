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
