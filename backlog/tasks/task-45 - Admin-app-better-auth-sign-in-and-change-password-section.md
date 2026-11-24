---
id: TASK-45
title: 'Admin app: better-auth sign-in and change-password section'
status: To Do
assignee: []
created_date: '2026-11-24T21:24:43Z'
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
- [ ] #1 Admin sign-in, sign-out, route guards and API calls work against better-auth, and a non-admin account is refused at login
- [ ] #2 The panel has an account section where the admin changes the password by entering the current and the new one
- [ ] #3 After a change the old password no longer signs in and the new one does
- [ ] #4 While the default password is in use the panel shows a persistent prompt to change it
- [ ] #5 apps/admin has no dependency on @supabase/supabase-js and its config.json has no Supabase fields
<!-- AC:END -->
