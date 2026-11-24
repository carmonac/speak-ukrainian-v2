---
id: TASK-43
title: better-auth in the API
status: To Do
assignee: []
created_date: '2026-11-24T21:24:42Z'
labels:
  - api
milestone: m-5
dependencies:
  - TASK-42
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Authentication is Supabase Auth: browsers sign in with supabase-js and the API verifies each bearer token by calling supabase.auth.getUser, reads the role from app_metadata, and several queries read auth.users directly. Supabase is being removed, and better-auth (https://github.com/better-auth) replaces it, hosted inside the NestJS API on D1. First version is e-mail and password only; Google and Apple sign-in must be prepared and left commented out so they can be enabled later without redesign. Admin and student apps must be able to hold independent sessions in the same browser, as they do today. The better-auth docs note that D1 lacks transactions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sign-up, sign-in, sign-out and password reset by e-mail work through the API for e-mail and password accounts
- [ ] #2 Every protected endpoint accepts a better-auth session and rejects missing, expired or revoked ones with 401
- [ ] #3 Roles admin and student are enforced exactly as before by @Roles, and a new account is always a student with a profile row
- [ ] #4 A banned account cannot call the API or load H5P content through URL tokens
- [ ] #5 Google and Apple providers are present in the auth configuration but commented out, with the required credentials and callback URLs noted beside them
- [ ] #6 The API has no dependency on @supabase/supabase-js and no SUPABASE_* settings
<!-- AC:END -->
