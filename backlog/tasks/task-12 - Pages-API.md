---
id: TASK-12
title: Pages API
status: Done
assignee: []
created_date: '2026-11-24T15:06:41Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - api
milestone: m-1
dependencies:
  - TASK-4
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CRUD for pages with texts and per-language translations, the single main page, and URL path validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Main page always exists and cannot be deleted
- [x] #2 Paths are unique and cannot collide with /api
- [x] #3 Texts and translations are saved atomically with the page
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pages API with texts and per-language translations saved in one transaction. Verified: the main page cannot be deleted (409); duplicate path 409; /api paths refused; a failed update left the stored texts and content untouched.
<!-- SECTION:FINAL_SUMMARY:END -->
