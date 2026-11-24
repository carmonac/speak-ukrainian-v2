---
id: TASK-46
title: 'Student app: better-auth register, login and password reset'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:43Z'
updated_date: '2026-11-24T23:12:59Z'
labels:
  - student
milestone: m-5
dependencies:
  - TASK-43
  - TASK-49
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/student uses supabase-js for register, login, forgot password, reset password (relying on Supabase signing the user in from the e-mail link) and for reading the session. With Supabase removed these flows must run against better-auth in the API, and the reset e-mail is now sent by our own e-mail service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A visitor can register with name, e-mail and password and lands signed in
- [x] #2 Login, logout, route guards and the returnUrl redirect behave as before
- [x] #3 Forgot password sends an e-mail whose link opens /reset-password and lets the user set a new password
- [x] #4 The account page still shows the e-mail and saves the full name
- [x] #5 apps/student has no dependency on @supabase/supabase-js and its config.json has no Supabase fields
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AuthService without any SDK, same approach as the admin app: fetch against /api/auth, bearer token plus the user in localStorage under a student-only key, cookies never sent. A stored session is checked with GET /api/auth/get-session on start.
2. Register signs the visitor in directly (the API returns a token); the "confirm your e-mail" outcome stays for the day verification is switched on (no token in the answer).
3. /reset-password now takes the token from the e-mailed link and posts it with the new password; afterwards the student signs in again, because a reset ends every session.
4. Interceptor: token added synchronously; a 401 on a request that carried a token forgets the session and goes to /login.
5. Remove @supabase/supabase-js, core/supabase.ts and the Supabase config fields. The Realtime subscription in SessionStore goes with it: the unread badge is polled while the tab is visible and the student is signed in, and the messages page polls its thread while open. That completes TASK-47 (the admin side was done in TASK-45), including removing MESSAGES_TABLE from packages/shared.
6. Minimum password length 8, matching the API.
7. Verify in the browser against the API on local D1.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented in apps/student.
- core/auth.service.ts: no SDK; fetch against /api/auth with the bearer token and the user in localStorage (key su-student-session), credentials omitted. A stored session is checked with GET /api/auth/get-session; an unreachable API keeps the session instead of signing the student out.
- Register signs in directly; the "confirm your e-mail" outcome remains for a response without a token. /reset-password takes ?token= from the link and returns to /login afterwards, since a reset ends every session.
- core/http.ts: synchronous token; a 401 on a request that carried a token forgets the session and goes to /login.
- Removed @supabase/supabase-js, core/supabase.ts and the Supabase config fields. SessionStore polls the unread count every 20 s and MessagesPage its thread every 5 s, both only while the tab is visible, plus a refresh on visibilitychange. MESSAGES_TABLE removed from packages/shared.
- Fixed on the way (pre-existing): the account page filled the name through a plain field inside an effect, so after a page reload the input stayed empty and a save would have wiped the name. It is a signal now.

Verified in the browser against the API on local D1: /messages while signed out redirects to /login?returnUrl=%2Fmessages; registering from /register?returnUrl=%2Fmessages lands signed in on /messages with the name in the header; an admin reply appears in the open thread within seconds; on another page the unread badge appears after the next poll; the account page shows the e-mail read-only and the saved name after a reload; sign-out clears the stored session and returns to /; wrong password shows the error; sign-in honours returnUrl; /login while signed in goes to /my-courses; forgot password shows the neutral confirmation and the API logs a link to /reset-password?token=...; the link sets a new password, shows a toast and returns to /login; the same link a second time is refused with a message; the old password answers 401 and the new one 200. Repo-wide lint, typecheck, test and build pass.
Not verified: the reset e-mail is only written to the API log locally (real sending is TASK-49); the course player and checkout were not exercised in the browser in this task; nothing deployed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The student classroom registers, signs in, signs out and resets passwords against better-auth with a bearer token of its own; the Supabase SDK and its config fields are gone. Guards and returnUrl behave as before, and the reset link now carries a token that the page posts with the new password. Realtime was replaced by polling. A pre-existing bug that left the name field empty after a reload of the account page was fixed. Verified end to end in the browser against the local API; reset e-mails are only logged until TASK-49.
<!-- SECTION:FINAL_SUMMARY:END -->
