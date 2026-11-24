---
id: TASK-43
title: better-auth in the API
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:42Z'
updated_date: '2026-11-24T22:49:35Z'
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
- [x] #1 Sign-up, sign-in, sign-out and password reset by e-mail work through the API for e-mail and password accounts
- [x] #2 Every protected endpoint accepts a better-auth session and rejects missing, expired or revoked ones with 401
- [x] #3 Roles admin and student are enforced exactly as before by @Roles, and a new account is always a student with a profile row
- [x] #4 A banned account cannot call the API or load H5P content through URL tokens
- [x] #5 Google and Apple providers are present in the auth configuration but commented out, with the required credentials and callback URLs noted beside them
- [x] #6 The API has no dependency on @supabase/supabase-js and no SUPABASE_* settings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. better-auth 1.7 inside the API, mounted at /api/auth ahead of the body parsers. Its Kysely adapter already accepts a D1-shaped object (prepare/bind/all + batch, no interactive transactions), so a thin shim over DatabaseService connects it to the bridge; the same shim over the SQLite test driver lets tests run the real library.
2. Plugins: bearer (each app keeps its own token, so admin and student sessions stay independent in one browser) and admin (role and ban fields, ban endpoints) with defaultRole student. User ids are UUIDs because route params are validated as UUIDs.
3. Migration 0002_auth.sql: session, account, verification, plus user.lastSignInAt (set from a session-create hook). The `user` table from 0001 already matches better-auth.
4. SessionAuthGuard replaces SupabaseAuthGuard (getSession per request, no cache so a revoked session is refused at once); the H5P URL-token guard reads the account from D1 and refuses banned ones; a user-create hook writes the profile row.
5. Password reset e-mails go through EmailService with a link to the student app (admin app for admins).
6. Admin bootstrap is ported to better-auth here because Supabase goes away; it creates ADMIN_EMAIL with the agreed default password. The default-password indicator and the rest of TASK-44 stay in TASK-44.
7. Remove infra/supabase, the user mirror, @supabase/supabase-js and SUPABASE_* settings. That includes the bucket bootstrap in StorageService and the endpoint default derived from SUPABASE_URL (STORAGE_S3_ENDPOINT becomes required) - a small overlap with TASK-48, needed for AC 6.
8. Google and Apple: commented-out socialProviders block with the env names and callback URLs.
9. Verification: integration tests of sign-up, sign-in, sign-out, reset, roles, bans and the guards on SQLite; live run of the API against wrangler dev. The two Angular apps still sign in with supabase-js and stay broken until TASK-45 and TASK-46.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: implemented with better-auth 1.7.27.
- auth/auth.ts: createAuth() (e-mail + password, bearer and admin plugins, UUID ids, profile row on user creation, lastSignInAt on session creation, reset e-mail through EmailService) and d1Like(), the D1-shaped shim over DatabaseService that the library adapter accepts natively (no interactive transactions). Google and Apple are a commented socialProviders block with env names, console links and callback URLs.
- auth/session-auth.guard.ts replaces SupabaseAuthGuard: one getSession per request, no cache. auth/accounts.service.ts reads accounts for code without a session (H5P URL-token guard, admin bootstrap).
- main.ts mounts the handler at /api/auth before the body parsers and exposes the set-auth-token header through CORS. Note: toNodeHandler already accounts for the Express mount path; rewriting req.url to originalUrl makes every auth route answer 404.
- apps/gateway/migrations/0002_auth.sql: session, account, verification, user.lastSignInAt. Applied to local and remote D1.
- Removed: infra/supabase, supabase-auth.guard, the temporary user mirror, @supabase/supabase-js, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. New setting AUTH_SECRET (min 32 chars). STORAGE_S3_ENDPOINT is now required and StorageService no longer creates the bucket (overlap with TASK-48, needed for AC 6).
- Admin bootstrap ported to better-auth here: creates ADMIN_EMAIL with password admin123 and logs no password. The default-password indicator is still TASK-44.

For the app tasks (TASK-45, TASK-46): routes are POST /api/auth/sign-up/email {email,password,name}, /sign-in/email, /sign-out, /request-password-reset {email}, /reset-password {token,newPassword}, /change-password {currentPassword,newPassword}. The session token is in the set-auth-token response header and goes back as Authorization: Bearer. Minimum password length is 8. Reset links are <STUDENT_APP_URL>/reset-password?token=... for students and <ADMIN_APP_URL>/reset-password?token=... for an administrator; the admin app has no such page yet.

Verification: 22 integration tests running the real library on SQLite with the D1 migrations (sign-up, duplicate and short password, role not settable at sign-up, sign-in, 401 for missing/made-up/signed-out/expired tokens, independent sessions, public and optional routes, roles, better-auth admin routes closed to students, bans including expiry and the ban API, H5P URL tokens of banned or unknown accounts, reset by e-mail with single-use link and session revocation, change password, first-run admin). Live run through HTTP against wrangler dev and local D1: 50/50 checks, signing in as the bootstrapped admin and a newly registered student, every non-H5P endpoint, sign-out, CORS preflight and exposed header; no errors in the API log and no password in it. Repo-wide lint, typecheck, test (639 API tests) and build pass.
Not verified: the two Angular apps still use supabase-js and cannot sign in until TASK-45 and TASK-46; nothing deployed; reset e-mails are only logged locally until TASK-49; the built-in rate limiter of better-auth (on in production, in memory) was not exercised.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Supabase Auth is replaced by better-auth inside the API, stored in D1 through the gateway bridge. Accounts use e-mail and password; sessions are bearer tokens, so the admin and student apps stay independent; roles admin/student and bans are enforced by the session guard, the roles guard and the H5P URL-token guard. Google and Apple are prepared but commented out. The API no longer depends on @supabase/supabase-js or any SUPABASE_* setting.

Verified by 22 integration tests on the real library and a 50-check live run over HTTP against the local D1; the auth tables are migrated on the remote D1 too.

Follow-ups: the Angular apps cannot sign in until TASK-45 and TASK-46; TASK-44 adds the default-password indicator; TASK-48 finishes the storage move (bucket bootstrap already removed here); reset e-mails are really sent only after TASK-49.
<!-- SECTION:FINAL_SUMMARY:END -->
