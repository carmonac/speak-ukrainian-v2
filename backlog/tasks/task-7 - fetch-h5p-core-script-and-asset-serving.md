---
id: TASK-7
title: fetch-h5p-core script and asset serving
status: Done
assignee: []
created_date: '2026-11-24T15:06:41Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - api
  - h5p
milestone: m-0
dependencies:
  - TASK-1
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port scripts/fetch-h5p-core.ts (pinned commits, sha256 check) and serve core/editor client assets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Script downloads and verifies core and editor assets
- [x] #2 Asset routes return 503 with a clear log when assets are missing
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ported scripts/fetch-h5p-core.ts (runs on postinstall and in the Docker build). Added core/styles/h5p-fonts.css to the editor and player styles: the pinned core keeps its icon font there. Verified: assets downloaded and hash-checked; with a missing assets directory the route answers 503 and logs it.
<!-- SECTION:FINAL_SUMMARY:END -->
