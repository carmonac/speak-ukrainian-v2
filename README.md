# SpeakUkrainian

Website, control panel and student classroom for a Ukrainian teacher who sells
H5P-based courses.

| Part              | What it is                                                                                           | Local URL                       |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- |
| `apps/api`        | NestJS API **and** the public website (pages written in the control panel, rendered with Handlebars) | http://localhost:8080           |
| `apps/admin`      | Control panel — Angular + ng-zorro-antd                                                              | http://localhost:4200           |
| `apps/student`    | Student classroom — Angular + ng-zorro-antd                                                          | http://localhost:4300           |
| `packages/shared` | Zod schemas and types shared by the three apps                                                       |                                 |
| `supabase/`       | Database migrations and local Supabase configuration                                                 | http://127.0.0.1:54323 (Studio) |
| `scripts/`        | `fetch-h5p-core.ts`: downloads the pinned H5P client libraries                                       |                                 |
| `backlog/`        | Project tasks, managed with [Backlog.md](https://github.com/MrLesk/Backlog.md)                       | `backlog browser`               |

Backend services are provided by **Supabase**: PostgreSQL, Auth, Storage (H5P
files) and Realtime (chat). Payments use **Stripe Checkout**; email uses
**SendGrid**.

## Requirements

- Node.js ≥ 22.18 and pnpm 11 (`corepack enable`)
- Docker (for the local Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Getting started

```bash
pnpm install          # also downloads the H5P core and editor client files
supabase start        # local Postgres, Auth, Storage, Realtime; applies migrations
cp .env.example .env  # then fill in the values `supabase status` prints
pnpm dev              # API on :8080, admin on :4200, classroom on :4300
```

In `.env`, take `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`STORAGE_S3_ACCESS_KEY_ID` and `STORAGE_S3_SECRET_ACCESS_KEY` from
`supabase status`, and generate `H5P_URL_TOKEN_SECRET` with
`openssl rand -hex 32`. The two Angular apps read `public/config.json`, which is
already set up for the local stack.

### The administrator account

There is exactly one administrator. The first time the API starts against a
project with no admin, it creates the account for `ADMIN_EMAIL` with a random
password and **prints it once** in the API log:

```
================ ADMIN ACCOUNT CREATED ================
  email:    admin@example.com
  password: …
```

Students register themselves from the classroom.

### Payments and email in development

- Without `STRIPE_SECRET_KEY` a purchase completes instantly, so the whole
  classroom can be exercised locally. To test real Stripe test-mode payments set
  the key and run `stripe listen --forward-to localhost:8080/api/payments/stripe/webhook`.
- Without `SENDGRID_API_KEY` emails are written to the API log instead of sent.

## Commands

| Command                             | What it does                                     |
| ----------------------------------- | ------------------------------------------------ |
| `pnpm dev`                          | Runs everything in watch mode                    |
| `pnpm build`                        | Builds every package                             |
| `pnpm test`                         | Unit tests                                       |
| `pnpm lint` / `pnpm typecheck`      | Static checks                                    |
| `pnpm format`                       | Prettier                                         |
| `pnpm db:reset`                     | Recreates the local database from the migrations |
| `pnpm db:migrate`                   | Applies the D1 migrations to the local database  |
| `pnpm db:migrate:remote`            | Applies the D1 migrations to the Cloudflare D1   |
| `pnpm h5p:fetch`                    | Re-downloads the H5P client libraries            |
| `backlog board` / `backlog browser` | Project progress                                 |

The D1 (SQLite) schema lives in `apps/gateway/migrations/`. `pnpm db:migrate`
writes to the local database that `wrangler dev` uses
(`apps/gateway/.wrangler/`); `pnpm db:migrate:remote` needs `wrangler login`.
Files (H5P content and libraries) are stored in Cloudflare R2. Locally the
gateway simulates the bucket on disk (`apps/gateway/.wrangler/`), so no account,
credentials or internet connection are needed; the API reaches both the database
and the bucket through the gateway, which is why `pnpm dev` starts it too.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the pieces fit together, the data model, security model
- [docs/deployment.md](docs/deployment.md) — deploying to a VPS with Docker Compose
- [docs/h5p.md](docs/h5p.md) — how H5P is integrated, and its limits
- [docs/pages.md](docs/pages.md) — writing public pages: texts, translations and Handlebars
