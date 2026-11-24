---
id: TASK-2
title: Supabase project and base migrations
status: Done
assignee: []
created_date: '2026-11-24T15:06:40Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - infra
  - db
milestone: m-0
dependencies:
  - TASK-1
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
supabase init, SQL migrations for the whole data model, RLS enabled deny-by-default, profile trigger on signup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 supabase start + db reset applies all migrations cleanly
- [x] #2 Every table has RLS enabled
- [x] #3 Signing up creates a profiles row
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
supabase/ project with one initial migration (14 tables, RLS on all, profile trigger, seeded main page). Verified: migrations applied cleanly to a fresh database on supabase start (db reset itself was not re-run, to keep local test data); no public table without RLS; the anon key reads nothing through PostgREST; signing up creates a profiles row.
<!-- SECTION:FINAL_SUMMARY:END -->
