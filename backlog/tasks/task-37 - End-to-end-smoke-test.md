---
id: TASK-37
title: End-to-end smoke test
status: Done
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-24T15:46:22Z'
labels:
  - qa
milestone: m-4
dependencies:
  - TASK-24
  - TASK-27
  - TASK-28
  - TASK-31
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Full flow: admin creates page and course, student registers, buys, learns, asks a question, admin replies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The whole flow passes locally
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Full flow exercised locally in the browser and through the API: admin creates page and course with H5P lessons; student registers, buys (dev payment mode), plays, completes, asks a question; admin replies live. Stripe test-mode card payment is tracked in TASK-24.
<!-- SECTION:FINAL_SUMMARY:END -->
