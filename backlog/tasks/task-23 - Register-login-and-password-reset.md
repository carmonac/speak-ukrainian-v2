---
id: TASK-23
title: Register, login and password reset
status: Done
assignee: []
created_date: '2026-11-24T15:06:43Z'
updated_date: '2026-11-24T15:46:21Z'
labels:
  - student
  - auth
milestone: m-2
dependencies:
  - TASK-9
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Supabase Auth flows in the student app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A visitor can register, log in, log out and reset the password
- [x] #2 Buying requires being logged in
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Register, login, logout and password reset. Verified in the browser against local Supabase, including the reset link from the local mail catcher; the buy button asks to sign in when signed out.
<!-- SECTION:FINAL_SUMMARY:END -->
