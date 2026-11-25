# SpeakUkrainian

pnpm + Turborepo monorepo: `apps/api` (NestJS 11, ESM — REST API under `/api` and the Handlebars-rendered public site), `apps/admin` and `apps/student` (Angular 22, zoneless, standalone, signals, ng-zorro-antd), `apps/gateway` (Cloudflare Worker in front of the API), `packages/shared` (Zod schemas — rebuild it after editing: the apps import its `dist`). Everything runs on Cloudflare: the API in a Container, data in D1 (SQLite; schema in `apps/gateway/migrations/`), files in R2, e-mail through Email Sending. Accounts are better-auth inside the API.

- Everything in the repository — code, comments, UI copy, docs, Backlog tasks — is written in **English**.
- Docs: `README.md`, `docs/architecture.md`, `docs/h5p.md`, `docs/pages.md`, `docs/deployment.md`. Read `docs/h5p.md` before touching `apps/api/src/h5p/` or any `h5p/` folder in the front-ends; that code is ported, heavily commented, and order-sensitive.
- Local stack: `pnpm dev` (API :8080, gateway :8787, admin :4200, student :4300); no Docker and no external services. The API needs the gateway running: it reaches the database, files and e-mail through it. `.claude/launch.json` has the dev servers.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`.
- All application data access goes through the API; browsers never reach the database. To expose data, add an API route.
- D1 has no interactive transactions and allows 100 parameters per statement: use `DatabaseService.batch()` for writes that must happen together, and pass lists as one JSON parameter (`jsonList`, `json_each`). Schema changes are new files in `apps/gateway/migrations/`.
- Deploys are run from a developer machine with `pnpm deploy:prod` (`scripts/deploy.ts`), never from GitHub Actions. It deploys to production: do not run it without being asked; `--dry-run` changes nothing. See `docs/deployment.md`.
- In NestJS files never turn an injected class import into `import type` (it erases DI metadata).
- ng-zorro 22 has no `nzAutosize`; use `cdkTextareaAutosize`.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.57.4 -->

<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:

- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
