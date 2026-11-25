---
id: TASK-52
title: API image for Cloudflare Containers
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-25T00:25:42Z'
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
- [x] #1 The image builds with local Docker and the API serves the public site and /api/health through the gateway
- [x] #2 Client IP and protocol are correct behind Cloudflare, so visitor tracking and secure URLs work
- [x] #3 CORS accepts exactly the admin and student origins
- [x] #4 H5P upload and editing work after the container has slept and restarted with an empty disk
- [x] #5 A cold start serves the first request without errors
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API bootstrap: trust exactly one proxy hop (the gateway), which sets X-Forwarded-For/Proto/Host from what Cloudflare observed; covered by a test of req.ip and req.protocol.
2. Gateway: production values for the container environment (public, admin and student URLs, CORS origins, H5P base URL) in wrangler.jsonc vars; instance type chosen explicitly at container start.
3. Safety found while reading: without a Stripe key the API enrolls students in paid courses for free ("dev mode"), and the production check that should prevent booting like that (loadConfig) is not wired in. In production a paid checkout without Stripe must be refused instead; free courses keep working.
4. A local configuration that runs the real API image under the gateway in container mode (apps/gateway/smoke/wrangler.api.jsonc), with its own local D1/R2 state and secrets in an untracked .dev.vars.
5. Verify there: image builds; public site and /api/health through the gateway; cold-start time; CORS preflights from allowed and foreign origins; sign-in; H5P upload and play; kill the container, let the gateway start a fresh one with an empty disk, upload and play again.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented; verified with the real image locally, not deployed.
- apps/api: common/proxy.ts - trust exactly one proxy hop (the gateway), replacing the Caddy-era setting; test of req.ip, req.protocol and hostname. The Dockerfile needed no change: it builds as it is (image 587 MB) and the H5P core and editor assets are baked in.
- apps/gateway: production container environment in wrangler.jsonc vars (PUBLIC_SITE_URL, ADMIN_APP_URL, STUDENT_APP_URL, CORS_ORIGINS, H5P_BASE_URL, EMAIL_*); instance type set explicitly to basic (1/4 vCPU, 1 GiB, 4 GB disk). Worker secrets still to create before the first deploy: AUTH_SECRET, H5P_URL_TOKEN_SECRET, CRON_SECRET, ADMIN_EMAIL (and the Stripe keys when payments go live).
- apps/gateway/smoke/wrangler.api.jsonc + scripts smoke:api and smoke:api:migrate: the real API image under the gateway in container mode on a developer machine, with its own local D1 and R2 state and secrets in an untracked smoke/.dev.vars.
- Payments safety, found while reading the config: without STRIPE_SECRET_KEY the API enrolled students in paid courses for free ("dev mode"), and the production-only check in loadConfig() is not wired into the app (it validates with envSchema.parse). PaymentsService now refuses a paid checkout with 503 in production when Stripe is not configured; free courses still enroll; two tests. loadConfig() itself is left alone - that belongs to TASK-24.

Verified with the real image in a local container behind the gateway (NODE_ENV=production): /api/health ok with database ok; the public site renders the seeded main page in Spanish for Accept-Language: es and an unknown path answers 404; CORS preflight allows the admin and student origins and gives no allow-origin header to another origin; the first-run admin exists and signs in, /api/admin/account and the dashboard answer; a 99 MB H5P package uploads in 1.8 s and plays with correct ranges; after killing the container the next request starts a fresh one in 1.8 s with an empty temp directory (a marker file written before the kill is gone), the same session token still works, content uploaded before the kill still plays, and upload/play/delete work again; the editor model, params and ajax endpoints answer, and saving an edit and creating content from the editor work on a freshly restarted container. The process runs as the unprivileged nodeapp user. Repo-wide lint, typecheck, test (673 API tests) and build pass.
Not verified: anything on Cloudflare itself - the client address and protocol as delivered by the real edge (locally the address is loopback), cold start and memory on a basic instance, and the secrets. Left for the first deploy (TASK-55, TASK-56).

2026-11-25 (production): the real image runs as a Cloudflare Container (instance type basic) behind the gateway. /api/health ok with database ok; the public site renders; CORS allows exactly the two app origins; the bridge paths answer 404 from the internet and the cron endpoint 403 without its secret; the first-run admin signs in. The session row written by that sign-in holds this machine's public address, so the client address reaches the API correctly through Cloudflare; plain http is redirected to https at the edge. The health wait after the first deploy completed within the script's window; a cold start after an idle period has not been timed yet.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The API image runs in Cloudflare Containers behind the gateway: one trusted proxy hop, production URLs and CORS from the gateway vars, an explicit container size, and no state on the container disk. Verified with the real image locally (including H5P upload and editing after restarts) and in production (health, site, CORS, admin sign-in, real client address). Also fixed: paid checkout without Stripe is refused in production instead of enrolling for free.
<!-- SECTION:FINAL_SUMMARY:END -->
