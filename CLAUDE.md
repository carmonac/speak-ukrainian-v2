# SpeakUkrainian

pnpm + Turborepo monorepo: `apps/api` (NestJS 11, ESM — REST API under `/api` and the Handlebars-rendered public site), `apps/admin` and `apps/student` (Angular 22, zoneless, standalone, signals, ng-zorro-antd), `packages/shared` (Zod schemas — rebuild it after editing: the apps import its `dist`). Supabase provides Postgres, Auth, Storage and Realtime; schema lives in `supabase/migrations/`.

- Everything in the repository — code, comments, UI copy, docs, Backlog tasks — is written in **English**.
- Docs: `README.md`, `docs/architecture.md`, `docs/h5p.md`, `docs/pages.md`, `docs/deployment.md`. Read `docs/h5p.md` before touching `apps/api/src/h5p/` or any `h5p/` folder in the front-ends; that code is ported, heavily commented, and order-sensitive.
- Local stack: `supabase start`, then `pnpm dev` (API :8080, admin :4200, student :4300). `.claude/launch.json` has the three dev servers.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- All application data access goes through the API (service role). RLS is deny-by-default; do not add client-side table access — add an API route.
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
