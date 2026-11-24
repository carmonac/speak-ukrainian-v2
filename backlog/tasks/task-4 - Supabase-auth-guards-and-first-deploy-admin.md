---
id: TASK-4
title: Supabase auth guards and first-deploy admin
status: Done
assignee: []
created_date: '2026-11-24T15:06:40Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - api
  - auth
milestone: m-0
dependencies:
  - TASK-2
  - TASK-3
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verify Supabase JWTs, roles from app_metadata, @Public and @Roles decorators, and create the single admin with a random password on first boot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Requests without a valid token get 401; students get 403 on admin routes
- [x] #2 On first boot with no admin, one is created and the password is logged exactly once
- [x] #3 Later boots never create or log credentials
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SupabaseAuthGuard (tokens verified by Supabase Auth, 30s cache), RolesGuard, @Public/@OptionalAuth, AdminBootstrapService. Verified: 401 without token, 403 for a student on admin routes; first boot created the admin and logged the password once; later boots logged nothing.
<!-- SECTION:FINAL_SUMMARY:END -->
