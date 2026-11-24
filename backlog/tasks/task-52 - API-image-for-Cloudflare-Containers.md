---
id: TASK-52
title: API image for Cloudflare Containers
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
labels:
  - api
  - infra
milestone: m-5
dependencies:
  - TASK-40
  - TASK-42
  - TASK-48
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/api/Dockerfile was written for a VPS behind Caddy. In Cloudflare Containers the image is built locally by wrangler, started by the gateway Durable Object, has an ephemeral disk and sleeps when idle. Things that assume the old host: trust proxy set for Caddy, URL and CORS variables derived from DOMAIN in docker-compose.prod.yml, the compose healthcheck, boot hooks, and the H5P temporary directory on local disk. H5P core and editor assets must stay baked into the image.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The image builds with local Docker and the API serves the public site and /api/health through the gateway
- [ ] #2 Client IP and protocol are correct behind Cloudflare, so visitor tracking and secure URLs work
- [ ] #3 CORS accepts exactly the admin and student origins
- [ ] #4 H5P upload and editing work after the container has slept and restarted with an empty disk
- [ ] #5 A cold start serves the first request without errors
<!-- AC:END -->
