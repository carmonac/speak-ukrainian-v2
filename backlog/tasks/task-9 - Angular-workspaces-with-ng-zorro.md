---
id: TASK-9
title: Angular workspaces with ng-zorro
status: Done
assignee: []
created_date: '2026-11-24T15:06:41Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - admin
  - student
milestone: m-0
dependencies:
  - TASK-1
  - TASK-8
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create admin and student Angular apps with ng-zorro-antd, Supabase client, typed API client, auth interceptor, environment config.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both apps build and serve
- [x] #2 API calls carry the Supabase access token
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
apps/admin and apps/student: Angular 22, zoneless, ng-zorro-antd 22, runtime config.json, Supabase client, auth interceptor. Verified: both build (dev and production) and their API calls carry the Supabase access token.
<!-- SECTION:FINAL_SUMMARY:END -->
