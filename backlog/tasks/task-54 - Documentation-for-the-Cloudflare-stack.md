---
id: TASK-54
title: Documentation for the Cloudflare stack
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-25T00:12:26Z'
labels:
  - docs
milestone: m-5
dependencies:
  - TASK-53
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
README.md, docs/architecture.md, docs/deployment.md and CLAUDE.md describe a VPS with Docker Compose, hosted Supabase and SendGrid. After the migration they would mislead anyone setting up or deploying the project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/architecture.md describes the gateway Worker, the API container, D1, R2, better-auth, e-mail and the cron trigger, and how a request flows through them
- [x] #2 docs/deployment.md lists the Cloudflare resources, every secret and where it is set, and the first-deploy steps including changing the default admin password
- [x] #3 The docs explain how to enable Google and Apple sign-in
- [x] #4 README.md and CLAUDE.md give the correct local setup and check commands
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: rewritten for the Cloudflare stack.
- docs/architecture.md: overview diagram, the four deployables, how a request flows (gateway -> Durable Object -> container -> bridge -> D1/R2/Email), the bridge routes, D1 rules that shape the code (batches, 100 parameters, value formats), data model including the auth tables, accounts and access with better-auth, modules, e-mail, chat polling, the daily Cron Trigger, payments behaviour without Stripe, front-end conventions and security notes.
- docs/deployment.md: what is needed, the Cloudflare resources, every setting and secret with where it is set, deploy commands and their order, first deploy and changing the default admin password, Stripe, post-deploy checks, rollback, backups, enabling Google and Apple sign-in (provider registration, API, secrets, and what the apps still need), and limits.
- README.md: parts table with the gateway, requirements (Node and pnpm only), getting started with the automatic setup, the administrator account, payments and e-mail in development, commands. CLAUDE.md: stack line, local stack, checks, data access, D1 rules, local-only deploys. docs/h5p.md: storage paragraph. The apps' wrangler.jsonc comments now say `pnpm ... run deploy` (plain `pnpm deploy` is a built-in command).
Checked: every file path named in the docs exists; the wrangler subcommands and flags used (d1 time-travel restore --timestamp, rollback, d1 export --remote --output) exist in the installed wrangler; a repository-wide search for supabase, sendgrid, caddy, firebase, firestore, "cloud run", "cloud storage", docker-compose and nginx matches nothing outside backlog/; pnpm format:check passes.
Not verified: the deploy commands and the "secrets before first deploy" order have not been run against Cloudflare; the local deployment script (TASK-55) will exercise them and docs/deployment.md should then point at it. The D1 Time Travel retention (30 days) and the Cron Trigger history location in the dashboard are stated from the product documentation, not observed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
README.md, CLAUDE.md, docs/architecture.md, docs/deployment.md and the storage part of docs/h5p.md now describe the Cloudflare stack: gateway Worker, API container, D1, R2, better-auth, Email Sending and the daily Cron Trigger, with the request flow, every setting and secret, the deploy steps including changing the default admin password, backups, rollback and how to enable Google and Apple sign-in. No reference to the old stack is left outside backlog history. The deploy commands in the document have not been run yet; TASK-55 will, and should link its script from deployment.md.
<!-- SECTION:FINAL_SUMMARY:END -->
