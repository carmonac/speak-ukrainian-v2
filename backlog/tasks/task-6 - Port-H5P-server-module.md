---
id: TASK-6
title: Port H5P server module
status: Done
assignee: []
created_date: '2026-11-24T15:06:40Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - api
  - h5p
milestone: m-0
dependencies:
  - TASK-4
  - TASK-5
  - TASK-7
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port apps/api/src/h5p from the old project: config, storage adapters, URL tokens, editor/ajax/content controllers and services, error mapping, package pre-scan, translations; Postgres h5p_content repository.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ported unit specs pass against the storage fake
- [x] #2 Uploading a .h5p stores it and returns its id
- [x] #3 Editor model, save and ajax endpoints work with the URL token
- [x] #4 Play requires an admin or an enrolled student
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ported apps/api/src/h5p from the old project; rewrote the content repository for Postgres and the guards for Supabase; play is now restricted and content files use a signed play token. Verified: ported specs pass; uploading a real .h5p stores it; editor load/save works in the browser through the URL token; play answers 401 anonymous, 403 not enrolled, 200 for admin and enrolled students.
<!-- SECTION:FINAL_SUMMARY:END -->
