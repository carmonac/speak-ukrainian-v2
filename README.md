# SpeakUkrainian

Website, control panel and student classroom for a Ukrainian teacher who sells
H5P-based courses.

| Part              | What it is                                                                                           | Local URL             |
| ----------------- | ---------------------------------------------------------------------------------------------------- | --------------------- |
| `apps/api`        | NestJS API **and** the public website (pages written in the control panel, rendered with Handlebars) | http://localhost:8080 |
| `apps/gateway`    | Cloudflare Worker in front of the API: database, files, e-mail and the daily schedule                | http://localhost:8787 |
| `apps/admin`      | Control panel — Angular + ng-zorro-antd                                                              | http://localhost:4200 |
| `apps/student`    | Student classroom — Angular + ng-zorro-antd                                                          | http://localhost:4300 |
| `packages/shared` | Zod schemas and types shared by the apps                                                             |                       |
| `scripts/`        | `fetch-h5p-core.ts` (pinned H5P client libraries) and `setup-local.ts` (local settings files)        |                       |
| `backlog/`        | Project tasks, managed with [Backlog.md](https://github.com/MrLesk/Backlog.md)                       | `backlog browser`     |

Everything runs on **Cloudflare**: the API in a Container behind a Worker, the
data in **D1**, H5P files in **R2**, e-mail through **Email Sending**, and the
two Angular apps as Workers static assets. Accounts are handled by
**better-auth** inside the API; payments use **Stripe Checkout**.

## Requirements

- Node.js ≥ 22.18 and pnpm 11 (`corepack enable`)

That is all for day-to-day development: the database, the file bucket and
e-mail are simulated locally by the gateway. Docker is only needed to deploy,
or to run the API as a container locally.

## Getting started

```bash
pnpm install   # also downloads the H5P core and editor client files
pnpm dev       # API :8080, gateway :8787, admin :4200, classroom :4300
```

The first `pnpm dev` creates `.env` and `apps/gateway/.dev.vars` from their
examples, generating the secrets, and the gateway applies the database
migrations. Both files are yours to edit afterwards; they are never
overwritten.

Local data lives in `apps/gateway/.wrangler/` (database and files). Delete
that folder to start from an empty database.

### The administrator account

There is exactly one administrator. The first time the API starts against a
database with no admin, it creates the account for `ADMIN_EMAIL`
(`admin@example.com` locally) with the password **`admin123`**. The control
panel shows a warning until the password is changed, under **Account**.

Students register themselves from the classroom.

### Payments and e-mail in development

- Without `STRIPE_SECRET_KEY` a purchase completes instantly, so the whole
  classroom can be exercised locally. To test real Stripe test-mode payments set
  the key and run `stripe listen --forward-to localhost:8080/api/payments/stripe/webhook`.
- E-mails are written to the API log instead of sent (`EMAIL_DELIVERY=log`).
  A password-reset link, for example, is printed there.

## Commands

| Command                             | What it does                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                          | Runs everything in watch mode                                    |
| `pnpm build`                        | Builds every package                                             |
| `pnpm test`                         | Unit tests                                                       |
| `pnpm lint` / `pnpm typecheck`      | Static checks                                                    |
| `pnpm format` / `pnpm format:check` | Prettier                                                         |
| `pnpm db:migrate`                   | Applies the D1 migrations to the local database                  |
| `pnpm db:migrate:remote`            | Applies the D1 migrations to the Cloudflare database             |
| `pnpm setup:local`                  | Creates the local settings files without starting anything       |
| `pnpm deploy:prod`                  | Deploys to Cloudflare ([docs/deployment.md](docs/deployment.md)) |
| `pnpm h5p:fetch`                    | Re-downloads the H5P client libraries                            |
| `backlog board` / `backlog browser` | Project progress                                                 |

In `apps/gateway`, `pnpm smoke` and `pnpm smoke:api` run the gateway with a
container under local Docker: the first with a small stub, the second with
the real API image, which is the closest thing to production on one machine.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the pieces fit together, the data model, security model
- [docs/deployment.md](docs/deployment.md) — deploying to Cloudflare, secrets, backups, enabling Google and Apple sign-in
- [docs/h5p.md](docs/h5p.md) — how H5P is integrated, and its limits
- [docs/pages.md](docs/pages.md) — writing public pages: texts, translations and Handlebars
