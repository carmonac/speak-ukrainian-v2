---
id: TASK-55
title: Local deployment script
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:21Z'
updated_date: '2026-11-25T09:15:57Z'
labels:
  - infra
milestone: m-5
dependencies:
  - TASK-50
  - TASK-51
  - TASK-52
  - TASK-53
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deployments are run from a developer machine, not from GitHub Actions. Deploying means several ordered steps across four targets (D1 migrations, the gateway with its container image, the admin app, the student app), and doing them by hand invites deploying a broken or half-updated system. Building the container image needs Docker running locally.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One command from the repository root runs lint, typecheck, test and build, applies pending D1 migrations, then deploys the gateway with the API container and both apps
- [x] #2 The script stops at the first failure and says which step failed
- [x] #3 A single target can be deployed on its own
- [x] #4 The script refuses to run when wrangler is not authenticated or Docker is not running, with a clear message
- [x] #5 It prints the deployed URLs at the end and contains no secrets
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scripts/deploy.ts, run as `pnpm deploy:prod [targets] [flags]` (not `pnpm deploy`, which is a built-in pnpm command). Targets: db, gateway, admin, student; none means all. Node built-ins only.
2. Preflight before anything changes: wrangler authenticated (whoami), Docker running when the gateway is a target, and the gateway's required secrets. Each refusal says what to do.
3. Secrets: AUTH_SECRET, H5P_URL_TOKEN_SECRET and CRON_SECRET are generated when missing; ADMIN_EMAIL has to be given once (--admin-email). Missing ones are written to a private temporary file, handed to wrangler with --secrets-file on that deploy, and the file is deleted; values are never printed and nothing secret is in the script.
4. Steps in order, each named, stopping at the first failure with the name of the step: lint, typecheck, test, build; D1 migrations (remote); gateway with the API image; admin; student. Then wait for /api/health and print the URLs.
5. --dry-run runs the preflight and the checks and asks wrangler for dry-run deploys, changing nothing; --skip-checks for a quick redeploy.
6. Verify the refusals and failure reporting locally (logged-out wrangler, unreachable Docker, a failing test), a dry run of everything and of a single target. The real run is the first production deploy and needs the owner's go-ahead and the administrator address.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: script written; not yet run for real.
- scripts/deploy.ts, run as `pnpm deploy:prod [db|gateway|admin|student ...] [--dry-run] [--skip-checks] [--admin-email=<address>]`. Node built-ins only. Preflight (wrangler whoami, Docker when the gateway is a target, gateway secrets), then lint, typecheck, test, build, D1 migrations (remote), gateway + API image, admin, student, a wait on /api/health, and the URLs.
- Secrets: AUTH_SECRET, H5P_URL_TOKEN_SECRET and CRON_SECRET are generated when the gateway does not have them; ADMIN_EMAIL must be given on the first deploy. Missing values go to a private temporary file passed to `wrangler deploy --secrets-file` and deleted afterwards; nothing secret is printed or stored in the repository.
- docs/deployment.md, README.md and CLAUDE.md point at the command.

Verified without deploying:
- wrangler logged out (invalid token in the environment): refuses with "wrangler is not logged in... Run: pnpm exec wrangler login".
- Docker unreachable (DOCKER_HOST pointing nowhere): refuses, naming Docker and the alternative of deploying other targets.
- First deploy without --admin-email: refuses and shows the command to run.
- A deliberately failing test: the run stops with "Failed at: Tests ... Nothing after this step was run"; migrations and deploy steps did not start.
- Full --dry-run: all steps in order, "No migrations to apply", dry-run deploys of the gateway (without building the image) and both apps, "nothing was deployed".
- `pnpm deploy:prod student --dry-run --skip-checks`: only the preflight and that target.
- No temporary secrets file left behind.
Not verified: a real run - the --secrets-file path on a Worker that does not exist yet, the image push, the health wait and the final list of URLs. That is the first production deploy and needs the owner to name the administrator address.

2026-11-25: first real run, `pnpm deploy:prod --admin-email=<the address the owner chose>`, exit 0. Preflight created the four secrets through --secrets-file on a Worker that did not exist yet; lint, typecheck, test and build ran; migrations (none pending); the gateway uploaded with the API image and its custom domain; admin (142 files) and student (35 files) deployed to their custom domains; the health check got {"status":"ok","database":"ok"}; the three URLs were printed. `wrangler secret list` shows ADMIN_EMAIL, AUTH_SECRET, CRON_SECRET and H5P_URL_TOKEN_SECRET; no temporary secrets file was left behind. Not exercised for real: a redeploy with secrets already present, and a single-target real deploy (both only as dry runs).

2026-11-25: second real run, from main with everything committed: preflight reported "Secrets: all present" and left them untouched, no migrations pending, gateway and both apps redeployed, health ok, exit 0.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T23:46:22Z

---

From TASK-50: the gateway needs the Worker secret CRON_SECRET (at least 16 characters) before its first deploy; the same value reaches the API container automatically. AUTH_SECRET and H5P_URL_TOKEN_SECRET are needed as Worker secrets too.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`pnpm deploy:prod` (scripts/deploy.ts) deploys everything from a developer machine: preflight (wrangler session, Docker, gateway secrets), lint, typecheck, test, build, D1 migrations, the gateway with the API image, and both apps, then waits for the API and prints the addresses. It stops at the first failing step and names it, accepts single targets, has --dry-run and --skip-checks, and creates the gateway secrets on the first deploy without printing them. Refusals, failure reporting and dry runs were tested locally, and the first production deploy was done with it successfully.
<!-- SECTION:FINAL_SUMMARY:END -->
