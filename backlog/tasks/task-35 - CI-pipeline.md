---
id: TASK-35
title: CI pipeline
status: In Progress
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-24T21:25:30Z'
labels:
  - infra
milestone: m-4
dependencies:
  - TASK-1
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions: lint, typecheck, test, build. Verification only: deployments are run from a developer machine with the local deployment script (TASK-55), never from GitHub Actions, and the stack is moving to Cloudflare (milestone M5), so the workflow must not build Docker images or deploy anything.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workflow runs on push and pull request
- [ ] #2 The workflow has no image-build or deploy job
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Workflow written at .github/workflows/ci.yml (lint, typecheck, test, build, image builds). The same commands pass locally. NOT verified: the workflow itself has never run — there is no GitHub remote yet.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T21:25:30Z

---

Scope narrowed on 2026-11-24: owner decided all deploys are local and hosting moves to Cloudflare. Keep the verify job; remove the images job from .github/workflows/ci.yml.

---
<!-- COMMENTS:END -->
