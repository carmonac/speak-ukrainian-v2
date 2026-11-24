---
id: TASK-42
title: DatabaseService on D1
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:42Z'
updated_date: '2026-11-24T22:39:39Z'
labels:
  - api
milestone: m-5
dependencies:
  - TASK-40
  - TASK-41
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/api/src/infra/db/database.service.ts wraps a pg Pool and twelve services write Postgres SQL against it. D1 is SQLite reached over HTTP through the gateway, has no interactive transactions (only atomic batches), allows at most 100 bound parameters per query, and returns different JS types than pg (the code currently relies on count and numeric arriving as strings and timestamptz as Date). Postgres-only constructs in use: distinct on, = any($n::uuid[]), ilike, make_interval, jsonb ->>, is not distinct from, greatest, current_date arithmetic, delete ... using, error codes 23505 and 23503, and direct reads of auth.users. Five db.transaction call sites exist in courses, pages and payments.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The API has no dependency on pg and no DATABASE_URL setting
- [x] #2 Every existing API endpoint returns the same response shapes as before against D1
- [x] #3 Multi-statement writes in courses, pages and payments are atomic: a failure part-way leaves no partial data
- [x] #4 Unique and foreign-key violations still map to the same HTTP errors
- [x] #5 Course saves with more than 100 lessons succeed
- [x] #6 pnpm test passes for the API
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. DatabaseService keeps query/rows/one and gains batch(statements); transaction() and Queryable go away. It talks to a small SqlDriver interface: BridgeDriver (HTTP to the gateway bridge, BRIDGE_URL + optional BRIDGE_SECRET) in the app, and an in-memory SQLite driver loaded with the D1 migrations in tests.
2. SQL errors become a DatabaseError with a kind (unique, foreign_key, other) derived from the SQLite message; isUniqueViolation / isForeignKeyViolation read it.
3. The five transactions become one batch each. Ids are generated in the API (randomUUID) instead of read back with RETURNING, existence is checked before the batch, and "not in this list" deletes use one JSON parameter (json_each) so the 100-parameter limit does not depend on course size.
4. Dialect port in the 12 callers: ?N placeholders, no schema prefix, timestamps as ISO strings produced in the API, numbers instead of numeric/count strings, integer booleans, distinct on -> row_number(), ilike -> like ... escape, make_interval/current_date arithmetic -> cutoffs computed in the API, is not distinct from -> is, greatest -> max.
5. auth.users becomes the `user` table. Until TASK-43 replaces Supabase Auth, a clearly marked temporary mirror in SupabaseAuthGuard upserts the verified user into `user`, and the admin bootstrap asks Supabase (not SQL) whether an admin exists; lastSignInAt is null until TASK-43 provides sessions.
6. Config: drop DATABASE_URL, pg and @types/pg; add BRIDGE_URL and BRIDGE_SECRET.
7. Tests: service-level specs against real SQLite for courses (including >100 lessons and rollback), pages, payments, messages, me, users, dashboard, h5p repository; then a live run of the API against wrangler dev + local D1 through the HTTP endpoints.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: implemented.
- apps/api/src/infra/db: sql-driver.ts (SqlDriver contract, DatabaseError with kind unique/foreign_key/other), bridge.driver.ts (HTTP to the gateway bridge), database.service.ts (query/rows/one/batch plus now(), newId(), jsonList()), sqlite.test-driver.ts (in-memory SQLite loaded with apps/gateway/migrations; excluded from the build). transaction() and Queryable are gone.
- Batches: courses create/update (course row + whole section/lesson tree), pages create/update, payments fulfil (update order + insert enrollment from the order row, safe to repeat). Ids come from newId(); existence is checked before the batch; kept-id lists travel as one JSON parameter.
- Dialect: ?N placeholders, no schema prefix, ISO strings and numbers straight from the driver, row_number() for the latest message per thread, like ... escape, cutoffs computed in the API, `is` and max() in the progress upsert.
- Config: DATABASE_URL, pg and @types/pg removed; BRIDGE_URL (default http://localhost:8787/__bridge) and BRIDGE_SECRET added to configuration.ts and .env.example.

Temporary, to be removed by TASK-43:
- auth/user-mirror.service.ts: SupabaseAuthGuard copies each verified account into the D1 `user` table (and creates its profile row), because accounts still live in Supabase Auth.
- admin-bootstrap asks Supabase Auth (listUsers) whether an admin exists instead of reading SQL.
- lastSignInAt is always null: there is no session table yet.

Behaviour differences to know:
- User search uses SQLite LIKE: case-insensitive for ASCII only, so a Cyrillic or accented name must match its case (Postgres ilike did not care).
- A save is one batch with one statement per row. The schema allows up to 100 sections x 200 lessons; that upper bound was not tried, 151 lessons was.

Verification: 60 new service-level tests on real SQLite (courses 12, pages 8, student flows 11, messages 9, users+dashboard 8, database/bridge driver/H5P repository 12) including a 150/151-lesson save, rollback of a failed course update, rollback of a page update, duplicate slug/path -> 409, foreign-key failure -> 409, idempotent fulfilment. Live run: API (Node) -> wrangler dev bridge -> local D1 with the local Supabase for sign-in: 40/40 checks over every non-H5P endpoint, including a 121-lesson course, a failed save leaving data unchanged, checkout, progress, chat, user search, dashboard and the public site; no errors in the API log. Repo-wide lint, typecheck, test (617 API tests) and build pass.
Not verified: the API against the remote D1 or inside the container (TASK-52); H5P endpoints were covered by the repository tests only, not exercised live.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The API no longer uses Postgres. DatabaseService now talks to Cloudflare D1 through the gateway bridge (BRIDGE_URL / BRIDGE_SECRET); pg and DATABASE_URL are gone. The SQL of all twelve callers is ported to SQLite, and the five transactions became atomic batches with ids generated in the API. Constraint failures are classified from the SQLite message, so duplicate slugs/paths and missing exercises still answer 409.

Verified with 60 new tests that run the real SQL on SQLite with the D1 schema, and with a live run of every non-H5P endpoint against the local D1 through wrangler dev (40/40), including courses of more than 100 lessons and failed saves leaving no partial data.

Follow-ups: TASK-43 must remove the temporary user mirror and the Supabase-based admin check and provide lastSignInAt; user search is now case-sensitive for non-ASCII names; not yet run against remote D1 or in the container (TASK-52).
<!-- SECTION:FINAL_SUMMARY:END -->
