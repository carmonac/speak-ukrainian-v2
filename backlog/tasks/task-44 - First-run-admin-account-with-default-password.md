---
id: TASK-44
title: First-run admin account with default password
status: To Do
assignee: []
created_date: '2026-11-24T21:24:43Z'
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
- [ ] #1 On a database with no admin, starting the API creates an admin for ADMIN_EMAIL whose password is admin123
- [ ] #2 Starting the API again, or when an admin already exists, creates nothing and never resets a password
- [ ] #3 The API can tell whether the admin still uses the default password so the panel can warn about it
- [ ] #4 No password is written to the logs
<!-- AC:END -->
