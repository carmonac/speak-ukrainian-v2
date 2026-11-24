---
id: TASK-55
title: Local deployment script
status: To Do
assignee: []
created_date: '2026-11-24T21:25:21Z'
labels:
  - infra
milestone: m-5
dependencies:
  - TASK-50
  - TASK-51
  - TASK-52
  - TASK-53
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deployments are run from a developer machine, not from GitHub Actions. Deploying means several ordered steps across four targets (D1 migrations, the gateway with its container image, the admin app, the student app), and doing them by hand invites deploying a broken or half-updated system. Building the container image needs Docker running locally.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One command from the repository root runs lint, typecheck, test and build, applies pending D1 migrations, then deploys the gateway with the API container and both apps
- [ ] #2 The script stops at the first failure and says which step failed
- [ ] #3 A single target can be deployed on its own
- [ ] #4 The script refuses to run when wrangler is not authenticated or Docker is not running, with a clear message
- [ ] #5 It prints the deployed URLs at the end and contains no secrets
<!-- AC:END -->
