---
id: TASK-3
title: NestJS API skeleton
status: Done
assignee: []
created_date: '2026-11-24T15:06:40Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - api
milestone: m-0
dependencies:
  - TASK-1
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NestJS 11 (ESM, Express 5): validated configuration, health endpoint, uniform error format, Supabase service client, Vitest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /api/health returns ok
- [x] #2 Missing required env vars fail fast at boot with a clear message
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
NestJS 11 skeleton: Zod-validated env, pg pool, Supabase admin client, error filter, GET /api/health. Verified: health answers ok; booting without H5P_URL_TOKEN_SECRET fails immediately naming the variable.
<!-- SECTION:FINAL_SUMMARY:END -->
