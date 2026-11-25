---
id: TASK-53
title: Remove Supabase, SendGrid and VPS leftovers; local dev without Supabase
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-25T00:12:27Z'
labels:
  - infra
milestone: m-5
dependencies:
  - TASK-42
  - TASK-43
  - TASK-47
  - TASK-48
  - TASK-49
  - TASK-52
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the API and both apps run on D1, better-auth, R2 and Cloudflare e-mail, the repository still carries the old stack: supabase/, docker-compose.prod.yml, docker/ (Caddy, nginx, spa-config), db:* scripts, Supabase and SendGrid variables in .env.example and configuration.ts, and about 22 source files with stale comments about Cloud Run, Firebase and Firestore from the previous project. Local development still says `supabase start`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A clean clone starts the whole stack with pnpm install and pnpm dev, with no Supabase CLI and no Docker required for day-to-day development
- [x] #2 supabase/, docker-compose.prod.yml, the Caddy and nginx files and the db:* scripts are gone
- [x] #3 .env.example and the API configuration contain only settings that are read
- [x] #4 .claude/launch.json starts every process needed locally
- [x] #5 Searching the repository for supabase, sendgrid, caddy, firebase or cloud run finds no stale references outside backlog history
- [x] #6 pnpm lint, typecheck, test and build pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete supabase/, docker-compose.prod.yml and docker/ (Caddy, nginx, spa-config); remove the db:start/stop/reset scripts, the DOMAIN block of .env.example and the old-stack entries in .gitignore, .prettierignore and .dockerignore; drop the image-build job from ci.yml (its Dockerfiles are gone; also what TASK-35 asks).
2. Clean clone: `pnpm dev` first runs a small idempotent setup that creates .env and apps/gateway/.dev.vars from their examples when missing (generating the secrets) and never overwrites them; the gateway dev script applies pending D1 migrations to the local database before starting. No Supabase CLI and no Docker.
3. Stale comments about Firebase, Firestore, Cloud Run, Cloud Storage, Supabase and Caddy in about 27 source files: reword to what the code does now. Comments only; no behaviour change in the H5P module.
4. README, docs/ and CLAUDE.md are rewritten in TASK-54; the repository-wide search of criterion 5 can only come out clean after that.
5. Verify in a fresh clone of the branch in a temporary directory: pnpm install, pnpm dev, API health, sign-in as the first-run admin, both apps reachable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented, except the documentation part of criterion 5.
- Removed: supabase/ (config and the Postgres migration), docker-compose.prod.yml, docker/ (Caddyfile, spa.Dockerfile, spa.nginx.conf, spa-config.sh), the db:start/stop/reset scripts, the DOMAIN block of .env.example, the Firebase entries of .gitignore, the Supabase entries of .prettierignore and .dockerignore, and the image-build job of .github/workflows/ci.yml (verify job kept). apps/api/Dockerfile stays: the gateway builds the API image from it.
- Local start: `pnpm dev` runs scripts/setup-local.ts (creates .env and apps/gateway/.dev.vars from their examples when missing, generating AUTH_SECRET and H5P_URL_TOKEN_SECRET; never overwrites) and the gateway dev script applies pending D1 migrations to the local database before starting. `pnpm setup:local` runs the setup alone.
- The admin bootstrap no longer blocks start-up and retries (10 attempts, 3 s apart) when the database is not reachable yet, since the API can come up before the gateway has applied migrations.
- Comments that still described the previous platform (Firebase, Firestore, Cloud Run, Cloud Storage) reworded in 27 source files to what the code does now. Comments and one test title/message only; no behaviour change in the H5P module.
- .openidea added to .prettierignore so `pnpm format:check` passes with that local folder present.

Verified: a copy of the tree without any untracked settings (no .env, no .dev.vars, no node_modules) came up with only `pnpm install --frozen-lockfile` and `pnpm dev`: both settings files created with mode 600, migrations applied, API health ok with database ok, public site rendering, first-run admin signing in with the default password and reading the dashboard, admin and student dev servers answering, and no Docker container started. Repo-wide lint, typecheck, test (675 API tests), build and format:check pass. A search for supabase, sendgrid, caddy, firebase, firestore, "cloud run" and "cloud storage" now matches only README.md, CLAUDE.md and docs/, which TASK-54 rewrites.
Not done here: README.md, CLAUDE.md and docs/ still describe the old stack (TASK-54). The local Supabase containers of the developer machine are still running; they are no longer used and can be stopped with `supabase stop --project-id new-speak-ukranian`.

2026-11-25: with TASK-54 done, the repository-wide search for supabase, sendgrid, caddy, firebase, firestore, "cloud run" and "cloud storage" matches nothing outside backlog/.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The repository no longer carries the old stack: supabase/, the production compose file, the Caddy and nginx files, the db:start/stop/reset scripts and the CI image job are gone, and comments in 27 files that still described the previous platform were reworded. A clean checkout now starts with pnpm install and pnpm dev alone - settings files are created on first run and the gateway applies the local migrations - with no Supabase CLI and no Docker. The admin bootstrap retries while the database is not ready. Verified from a clean copy of the tree and by the repo-wide checks.
<!-- SECTION:FINAL_SUMMARY:END -->
