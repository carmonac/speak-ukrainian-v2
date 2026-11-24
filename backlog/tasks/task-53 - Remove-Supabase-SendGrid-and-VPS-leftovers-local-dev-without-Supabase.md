---
id: TASK-53
title: Remove Supabase, SendGrid and VPS leftovers; local dev without Supabase
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
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
- [ ] #1 A clean clone starts the whole stack with pnpm install and pnpm dev, with no Supabase CLI and no Docker required for day-to-day development
- [ ] #2 supabase/, docker-compose.prod.yml, the Caddy and nginx files and the db:* scripts are gone
- [ ] #3 .env.example and the API configuration contain only settings that are read
- [ ] #4 .claude/launch.json starts every process needed locally
- [ ] #5 Searching the repository for supabase, sendgrid, caddy, firebase or cloud run finds no stale references outside backlog history
- [ ] #6 pnpm lint, typecheck, test and build pass
<!-- AC:END -->
