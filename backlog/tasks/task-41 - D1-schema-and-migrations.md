---
id: TASK-41
title: D1 schema and migrations
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:42Z'
updated_date: '2026-11-24T22:06:09Z'
labels:
  - api
  - infra
milestone: m-5
dependencies:
  - TASK-40
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The schema lives in supabase/migrations/20261124000000_init.sql and is Postgres- and Supabase-specific: pgcrypto and gen_random_uuid() defaults, timestamptz, numeric, plpgsql functions and triggers (touch_updated_at, handle_new_user, is_admin), foreign keys to auth.users, RLS on all 14 tables, one policy and the supabase_realtime publication. D1 is SQLite, so the schema has to be rewritten. There is no production data to migrate. The main-page seed in the same migration must survive. User rows will be owned by better-auth (separate task), so references to auth.users need a new target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 D1 migrations create the 14 application tables with equivalent constraints, checks and partial indexes
- [x] #2 A fresh database contains the seeded main page with its texts and translations
- [x] #3 updated_at is maintained on profiles, pages, h5p_content and courses
- [x] #4 No RLS, policies, publications or references to the auth schema remain
- [x] #5 One documented command applies migrations to the local database and one to the remote database
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One migration, apps/gateway/migrations/0001_init.sql, applied by wrangler (the gateway owns the D1 binding).
2. Type mapping: uuid -> text with a v4-shaped default; timestamptz -> text, ISO 8601 UTC with milliseconds (same shape as JS toISOString, sorts chronologically); boolean -> integer 0/1 with a check; numeric -> real; date -> text YYYY-MM-DD; bigint/int -> integer. Application tables are STRICT so a wrongly typed write fails instead of being stored.
3. Users: foreign keys that pointed at auth.users point at a `user` table using better-auth default column names. The table is created here so TASK-42 has something to join and insert against; sessions, accounts and verification tables stay with TASK-43, which can extend `user` in a later migration.
4. updated_at: AFTER UPDATE triggers on profiles, pages, h5p_content and courses. The profile-on-signup trigger is not ported: creating the profile row becomes API code in TASK-43.
5. Dropped: pgcrypto, is_admin(), RLS, the messages policy and the realtime publication.
6. Seed: main page, 3 texts, 6 translations, rewritten without data-modifying CTEs.
7. Commands: db:migrate (local) and db:migrate:remote in the gateway package and at the root; documented in the README.
8. Verification: a vitest spec that loads the migration into SQLite (node:sqlite) and checks tables, constraints, partial indexes, triggers and seed; then apply to the local D1 and to the remote D1 and query both.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: apps/gateway/migrations/0001_init.sql written and applied to the local and the remote D1 (database speakukrainian).
Decisions:
- Per-user foreign keys point at a `user` table created in this migration with better-auth default column names (id, name, email, emailVerified, image, createdAt, updatedAt) plus role, banned, banReason, banExpires. It is not STRICT. TASK-43 adds session/account/verification and may extend it in a new migration; if its shape turns out wrong for the better-auth version chosen, fix it with a follow-up migration (0001 is already applied remotely).
- The Postgres trigger that created a profile row on sign-up is not ported; that is API code in TASK-43.
- updated_at triggers are AFTER UPDATE with `when new.updated_at = old.updated_at`: an update that sets updated_at itself keeps its value (Postgres always overwrote it).
- Timestamps are text in the exact toISOString() shape; the API received Date objects from pg and now receives strings (TASK-42). score/max_score are REAL and arrive as numbers, count(*) as a number.
- Ids default to v4-shaped UUID text so existing uuid validation keeps passing.
- supabase/ is left in place; TASK-53 removes it.
Commands: `pnpm db:migrate` (local, state in apps/gateway/.wrangler) and `pnpm db:migrate:remote`; documented in README.md and the migration header.
Verification: test/migrations.spec.ts (20 tests, node:sqlite) covers tables, STRICT, defaults, unique/check/foreign-key behaviour, cascades, partial indexes, the four triggers and the seed byte-for-byte. Local D1: 15 tables, 1 page / 3 texts / 6 translations, 4 triggers, second apply is a no-op. Remote D1: same counts; a probe course row had updated_at refreshed by the trigger; an orphan profile, a text price and a second main page were rejected (FOREIGN KEY, STRICT datatype, UNIQUE); probe row removed, only the seeded page remains. Repo-wide lint, typecheck, test and build pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ported the Supabase/Postgres schema to D1 as apps/gateway/migrations/0001_init.sql: the 14 application tables (STRICT, same constraints, checks and partial indexes), a better-auth-shaped `user` table as the new target of every per-user foreign key, updated_at triggers on profiles, pages, h5p_content and courses, and the main-page seed. RLS, the policy, the realtime publication, pgcrypto and the plpgsql functions are gone. `pnpm db:migrate` and `pnpm db:migrate:remote` apply it; both databases are migrated.

Verified by a 20-test spec that loads the migration into SQLite and by queries against the local and the remote D1 (counts, trigger, foreign key, STRICT and unique rejections).

Follow-ups: the API still talks to Postgres (TASK-42); TASK-43 owns the rest of the auth tables and profile creation on sign-up, and should confirm the `user` columns against the better-auth version it adopts.
<!-- SECTION:FINAL_SUMMARY:END -->
