---
id: TASK-35
title: CI pipeline
status: In Progress
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-24T15:46:22Z'
labels:
  - infra
milestone: m-4
dependencies:
  - TASK-1
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions: lint, typecheck, test, build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workflow runs on push and pull request
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Workflow written at .github/workflows/ci.yml (lint, typecheck, test, build, image builds). The same commands pass locally. NOT verified: the workflow itself has never run — there is no GitHub remote yet.
<!-- SECTION:NOTES:END -->
