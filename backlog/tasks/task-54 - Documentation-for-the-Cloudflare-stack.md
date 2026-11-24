---
id: TASK-54
title: Documentation for the Cloudflare stack
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
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
- [ ] #1 docs/architecture.md describes the gateway Worker, the API container, D1, R2, better-auth, e-mail and the cron trigger, and how a request flows through them
- [ ] #2 docs/deployment.md lists the Cloudflare resources, every secret and where it is set, and the first-deploy steps including changing the default admin password
- [ ] #3 The docs explain how to enable Google and Apple sign-in
- [ ] #4 README.md and CLAUDE.md give the correct local setup and check commands
<!-- AC:END -->
