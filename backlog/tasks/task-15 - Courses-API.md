---
id: TASK-15
title: Courses API
status: Done
assignee: []
created_date: '2026-11-24T15:06:42Z'
updated_date: '2026-11-24T15:46:21Z'
labels:
  - api
milestone: m-1
dependencies:
  - TASK-4
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CRUD for courses, sections and lessons with ordering, price and draft/published status.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sections and lessons can be reordered
- [x] #2 Price is stored in minor units with a currency
- [x] #3 Only published courses are visible to students
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Courses API: whole tree saved transactionally, ids preserved on reorder, price in cents + currency, draft/published. Verified: reordering kept lesson ids and student progress; a draft course disappears from the public catalogue and its outline answers 404.
<!-- SECTION:FINAL_SUMMARY:END -->
