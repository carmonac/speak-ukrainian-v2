---
id: TASK-51
title: Admin and student apps on Workers static assets
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
labels:
  - admin
  - student
  - infra
milestone: m-5
dependencies:
  - TASK-39
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The two Angular SPAs are served by nginx containers that write config.json at start (docker/spa.Dockerfile, docker/spa-config.sh). They move to Cloudflare Workers static assets on admin.speakukrainian.org and student.speakukrainian.org. Both are SPA-only builds (dist/<app>/browser); the admin build also ships Monaco under monaco/vs. config.json is fetched before bootstrap and must not be cached; hashed bundles should be cached long-term.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each app has a wrangler configuration that deploys its production build to its custom domain
- [ ] #2 Deep links such as /courses/123 load the app instead of a 404
- [ ] #3 config.json is served with no-store and points at https://speakukrainian.org/api; hashed assets are immutable
- [ ] #4 Responses carry nosniff, frame-deny and referrer-policy headers as the nginx setup did
<!-- AC:END -->
