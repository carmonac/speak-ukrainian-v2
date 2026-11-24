---
id: TASK-45
title: 'Admin app: better-auth sign-in and change-password section'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:43Z'
updated_date: '2026-11-24T22:59:27Z'
labels:
  - admin
milestone: m-5
dependencies:
  - TASK-43
  - TASK-44
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/admin signs in with supabase-js and has no way to change the password: today that is done in the Supabase dashboard, which is going away. The admin account now starts with the known password admin123, so changing it from the panel is required for a safe first deployment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Admin sign-in, sign-out, route guards and API calls work against better-auth, and a non-admin account is refused at login
- [x] #2 The panel has an account section where the admin changes the password by entering the current and the new one
- [x] #3 After a change the old password no longer signs in and the new one does
- [x] #4 While the default password is in use the panel shows a persistent prompt to change it
- [x] #5 apps/admin has no dependency on @supabase/supabase-js and its config.json has no Supabase fields
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AuthService without any SDK: plain fetch against /api/auth (sign-in, sign-out, change-password, request-password-reset, reset-password), the bearer token kept in localStorage under an admin-only key, cookies never sent, so the session stays independent from the student app. A stored token is validated on start with GET /api/admin/account, which also proves the role and carries usesDefaultPassword.
2. A non-admin who signs in is signed out again and told the account is not the administrator.
3. New /account page (current, new, repeat) and a shell banner that stays on every page while the default password is in use; header link to the account.
4. Password recovery, because the API already e-mails administrators a link to <admin>/reset-password: a "Forgot your password?" action on the login page and a /reset-password page.
5. Remove @supabase/supabase-js, core/supabase.ts and the Supabase fields of config.json. The conversation page loses its Realtime channel; it polls every few seconds while the tab is visible instead (the admin half of TASK-47).
6. Verify in the browser against the API on local D1.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented in apps/admin.
- core/auth.service.ts: no SDK; fetch against /api/auth with the bearer token in localStorage (key su-admin-session), credentials omitted. A stored token is validated with GET /api/admin/account, which also supplies usesDefaultPassword. A non-admin sign-in is signed out again.
- core/http.ts: the interceptor adds the token synchronously and, on a 401, forgets the session and goes to /login.
- New: features/account/account-page.ts (/account), features/login/reset-password-page.ts (/reset-password?token=), "Forgot your password?" on the login page, a header link to the account and a warning banner in the shell on every page while the default password is in use.
- Removed @supabase/supabase-js, core/supabase.ts and the Supabase fields of runtime config and public/config.json.
- Conversation page: Realtime channel replaced by polling every 5 s while the tab is visible, plus a refresh when the tab becomes visible (admin half of TASK-47).

Verified in the browser against the API on local D1: unauthenticated visit redirects to /login; wrong password shows "Wrong email or password."; admin signs in and the dashboard loads; the session survives a reload; the banner shows on the dashboard and on /users and links to /account; a wrong current password is refused; changing the password succeeds, the banner disappears; after sign-out the stored token is gone, the old password is refused, a student account gets "This account is not the administrator." and no token is stored, the new password signs in; a reset link from the API log opens /reset-password, sets a new password and ends the local session; "Forgot your password?" shows the neutral notice; an open conversation polled 4 times in 17 s and showed a message sent by the student without a reload. Repo-wide lint, typecheck, test and build pass.
Not verified: after the last browser run the account form was changed to call form.resetForm() so the emptied fields do not show as invalid; that change compiles and lints but was not looked at again in the browser. One sign-in right after "Forgot your password?" did not submit on the first Enter in the automated run and did on the second; not reproduced by hand. docker/spa-config.sh still writes Supabase fields into config.json for the old nginx image (removed with TASK-51/TASK-53). Nothing deployed.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T22:49:35Z

---

From TASK-43: an administrator password-reset e-mail links to <ADMIN_APP_URL>/reset-password?token=..., a page the admin app does not have. Either add it here or change the link in apps/api/src/auth/auth.ts. Auth routes and token handling are listed in the TASK-43 notes.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The admin panel signs in against better-auth with a bearer token of its own, refuses non-admin accounts, and has an Account page to change the password plus a banner on every page while the default password is still in use. Password recovery (forgot link and /reset-password page) was added because the API already e-mails administrators that link. The Supabase SDK and its config fields are gone; the conversation page now polls instead of using Realtime. Verified end to end in the browser against the local API.
<!-- SECTION:FINAL_SUMMARY:END -->
