---
id: TASK-35
title: CI pipeline
status: Done
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-27T19:01:03Z'
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
- [x] #1 Workflow runs on push and pull request
- [x] #2 The workflow has no image-build or deploy job
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

created: 2026-11-25T00:07:04Z

---

From TASK-53: the image-build job is gone from ci.yml; only the verify job remains (format check, lint, typecheck, test, build). The workflow still has not been seen running: it triggers on pull requests and on pushes to main, and the work so far is on the branch m5-cloudflare-migration without a pull request.

---

created: 2026-11-25T09:15:57Z

---

The workflow ran on the push to main of 2026-11-25 (run 45583279036) and passed in 1m32s: format check, lint, typecheck, test, build. It has not been seen running on a pull request yet.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
GitHub Actions workflow .github/workflows/ci.yml with a single verify job (format check, lint, typecheck, test, build); no image-build or deploy job, since deploys are local (TASK-55) and hosting is on Cloudflare. Verified on every push to main since 2026-11-25 (all green, ~1.5 min). The pull_request trigger is configured but has not been observed yet because the repository has had no pull requests; closed by the owner's decision on 2026-11-27.
<!-- SECTION:FINAL_SUMMARY:END -->
