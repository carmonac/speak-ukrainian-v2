---
id: TASK-46
title: 'Student app: better-auth register, login and password reset'
status: To Do
assignee: []
created_date: '2026-11-24T21:24:43Z'
updated_date: '2026-11-24T21:25:30Z'
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
- [ ] #1 A visitor can register with name, e-mail and password and lands signed in
- [ ] #2 Login, logout, route guards and the returnUrl redirect behave as before
- [ ] #3 Forgot password sends an e-mail whose link opens /reset-password and lets the user set a new password
- [ ] #4 The account page still shows the e-mail and saves the full name
- [ ] #5 apps/student has no dependency on @supabase/supabase-js and its config.json has no Supabase fields
<!-- AC:END -->
