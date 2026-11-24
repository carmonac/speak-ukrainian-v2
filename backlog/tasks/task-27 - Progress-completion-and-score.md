---
id: TASK-27
title: 'Progress: completion and score'
status: Done
assignee: []
created_date: '2026-11-24T15:06:43Z'
updated_date: '2026-11-24T15:46:22Z'
labels:
  - student
  - api
  - h5p
milestone: m-2
dependencies:
  - TASK-26
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Capture H5P xAPI events, store completion and score per lesson, show course percentage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Completing an exercise marks the lesson complete with its score
- [x] #2 Course progress percentage is shown
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
xAPI capture: completed/answered statements of the top-level content are posted as completion + score; best score kept. Verified in the browser: answering the quiz marked the lesson complete (1/1) and the course showed 50%. Compound content types (e.g. Course Presentation) were not tried.
<!-- SECTION:FINAL_SUMMARY:END -->
