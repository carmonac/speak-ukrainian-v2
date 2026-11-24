---
id: TASK-31
title: Main page and custom page routing
status: Done
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-24T15:46:22Z'
labels:
  - api
  - site
milestone: m-3
dependencies:
  - TASK-30
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Serve the main page at / and custom pages at their URL path, with cache invalidation on save.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Edits in the panel are visible immediately
- [x] #2 Unknown paths return 404
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Public site served by the API for every GET outside /api. Verified: main page at /, custom page at its path, edits visible on the next request, unknown path 404.
<!-- SECTION:FINAL_SUMMARY:END -->
