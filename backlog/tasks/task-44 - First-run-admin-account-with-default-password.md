---
id: TASK-44
title: First-run admin account with default password
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:43Z'
updated_date: '2026-11-24T22:52:53Z'
labels:
  - api
milestone: m-5
dependencies:
  - TASK-43
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On first start admin-bootstrap.service.ts creates the admin through the Supabase admin API with a random password that is printed once in the logs. Container logs are not a convenient place to recover a password, so the owner asked for a fixed initial password, admin123, to be changed from the admin panel afterwards.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a database with no admin, starting the API creates an admin for ADMIN_EMAIL whose password is admin123
- [x] #2 Starting the API again, or when an admin already exists, creates nothing and never resets a password
- [x] #3 The API can tell whether the admin still uses the default password so the panel can warn about it
- [x] #4 No password is written to the logs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Already in place from TASK-43: AdminBootstrapService creates ADMIN_EMAIL through better-auth with the default password, does nothing when an admin exists, logs no password.
2. Add GET /api/admin/account (admin only) returning the e-mail and usesDefaultPassword. The flag is computed, not stored: the default password is checked against the stored hash with better-auth's own verifier, so it is correct however the password was changed (panel, reset link, database).
3. Shared type AdminAccount in packages/shared for the admin app (TASK-45).
4. Tests on SQLite with the real library, then a live check over HTTP.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: GET /api/admin/account (admin only) returns { email, usesDefaultPassword } (shared type AdminAccount). The flag is computed by verifying the default password against the stored hash with better-auth's verifier (AccountsService.hasPassword), so nothing extra is stored and it stays right after a change, a reset link or a manual edit. Bootstrap itself was done in TASK-43.
Verification: auth.spec.ts now has 24 tests; the ones for this task cover creation with the default password and sign-in with it, no-op and no password reset when an admin exists (including after the owner changed it), the indicator going true -> false after change-password -> true again after resetting back to the default, and a capture of console/stdout/stderr during bootstrap and a failed sign-in that contains the e-mail but neither password. Live over HTTP on local D1: indicator true for the bootstrapped admin, false after changing the password, true after restoring it; 403 for a student, 401 anonymous. Repo-wide lint, typecheck, test and build pass.
Not verified: first start against the remote database (nothing is deployed yet).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T22:49:35Z

---

From TASK-43: the bootstrap already creates ADMIN_EMAIL with the default password through better-auth and logs no password (auth/admin-bootstrap.service.ts, covered by auth.spec.ts). What is left here is the indicator that the default password is still in use, and finalising the criteria.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
On first start the API creates ADMIN_EMAIL with the password admin123 through better-auth, leaves an existing administrator alone, and logs no password. A new admin-only endpoint, GET /api/admin/account, tells the panel whether the default password is still in use; it checks the stored hash, so it needs no extra state. Verified by integration tests on the real library and a live check over HTTP. The panel prompt that uses it is TASK-45.
<!-- SECTION:FINAL_SUMMARY:END -->
