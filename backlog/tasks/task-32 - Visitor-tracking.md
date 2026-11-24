---
id: TASK-32
title: Visitor tracking
status: Done
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-24T15:46:22Z'
labels:
  - api
  - site
milestone: m-3
dependencies:
  - TASK-31
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cookieless unique-visitor counting per day feeding the dashboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard visitor count increases with new visitors
- [x] #2 No raw IP is stored
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Daily salted visitor hash in page_views. Verified: a new browser-like visitor raised the dashboard count by one across two page loads; a bot user agent was not counted; the table has no IP column.
<!-- SECTION:FINAL_SUMMARY:END -->
