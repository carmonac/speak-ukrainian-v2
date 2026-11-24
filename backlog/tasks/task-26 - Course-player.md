---
id: TASK-26
title: Course player
status: Done
assignee: []
created_date: '2026-11-24T15:06:43Z'
updated_date: '2026-11-24T15:46:21Z'
labels:
  - student
  - h5p
milestone: m-2
dependencies:
  - TASK-25
  - TASK-6
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Take a course: section/lesson navigation and the protected H5P player.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Enrolled students can play every lesson
- [x] #2 Non-enrolled users cannot load exercises
- [x] #3 Previous/next navigation works
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Course player with section/lesson navigation and the protected H5P player. Verified in the browser for an enrolled student; a non-enrolled student gets 403 for the course and the exercise.
<!-- SECTION:FINAL_SUMMARY:END -->
