---
id: TASK-30
title: Handlebars public renderer
status: Done
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-24T15:46:22Z'
labels:
  - api
  - site
milestone: m-3
dependencies:
  - TASK-12
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render pages server-side with Handlebars: locale from Accept-Language, per-text fallback to English, studentUrl helper, 404 page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Texts resolve to the browser language
- [x] #2 Missing translations fall back to English
- [x] #3 Template errors render a safe error page, not a crash
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SiteRenderer + locale negotiation. Verified: Spanish browser gets Spanish, other languages get English, ?lang overrides; a broken template yields an error page. Unit tests cover fallback order, escaping and prototype access.
<!-- SECTION:FINAL_SUMMARY:END -->
