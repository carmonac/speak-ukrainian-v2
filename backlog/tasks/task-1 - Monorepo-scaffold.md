---
id: TASK-1
title: Monorepo scaffold
status: Done
assignee: []
created_date: '2026-11-24T15:06:40Z'
updated_date: '2026-11-24T15:46:20Z'
labels:
  - infra
milestone: m-0
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pnpm workspaces + Turborepo, TypeScript, ESLint, Prettier, README and CLAUDE.md conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm install, lint, typecheck, test and build run from the root
- [x] #2 apps/api, apps/admin, apps/student, packages/shared, scripts exist as workspaces
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
pnpm + Turborepo monorepo with apps/api, apps/admin, apps/student, packages/shared and scripts. Verified: pnpm install, lint, typecheck, test and build all pass from the root.
<!-- SECTION:FINAL_SUMMARY:END -->
