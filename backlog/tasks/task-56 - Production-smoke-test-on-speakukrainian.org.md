---
id: TASK-56
title: Production smoke test on speakukrainian.org
status: To Do
assignee: []
created_date: '2026-11-24T21:25:21Z'
labels:
  - infra
milestone: m-5
dependencies:
  - TASK-55
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The migration replaces the database, authentication, storage, e-mail and hosting at once, and several pieces (containers behind a Worker, Email Sending beta, D1 over HTTP) can only be proven on the real platform.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 https://speakukrainian.org renders the main page and www redirects to it
- [ ] #2 The admin signs in with the default password, changes it, and the old one stops working
- [ ] #3 A new student registers, receives a password-reset e-mail and signs in with the new password
- [ ] #4 An H5P package is uploaded in the admin app and played in the student app
- [ ] #5 A chat message sent by the student appears for the admin and the reply appears for the student
- [ ] #6 The daily reminder endpoint, triggered once by hand, completes without error
<!-- AC:END -->
