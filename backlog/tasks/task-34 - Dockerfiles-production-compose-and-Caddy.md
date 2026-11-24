---
id: TASK-34
title: Dockerfiles, production compose and Caddy
status: Done
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-24T15:46:22Z'
labels:
  - infra
milestone: m-4
dependencies:
  - TASK-6
  - TASK-9
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Images for api, admin and student; docker-compose.prod.yml with Caddy TLS and subdomain routing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docker compose build succeeds
- [x] #2 admin. and student. subdomains route to their apps
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dockerfiles (API; one shared for both SPAs), docker-compose.prod.yml and Caddyfile. Verified: the three images build; the stack ran locally with DOMAIN=localhost on test ports and served the site, admin.localhost and student.localhost over TLS with the generated config.json.
<!-- SECTION:FINAL_SUMMARY:END -->
