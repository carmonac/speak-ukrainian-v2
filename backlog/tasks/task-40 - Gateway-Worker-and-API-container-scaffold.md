---
id: TASK-40
title: Gateway Worker and API container scaffold
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:42Z'
updated_date: '2026-11-24T22:02:20Z'
labels:
  - infra
  - api
milestone: m-5
dependencies:
  - TASK-38
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The NestJS API (REST under /api plus the Handlebars public site) will run in Cloudflare Containers. A container is only reachable through a Worker with a Durable Object, and code inside it cannot use Worker bindings: D1 and the send_email binding have to be exposed by the Worker, which the docs do by intercepting the container outbound HTTP (interceptOutboundHttp, needs a compatibility date of 2025-11-17 or later). A new Worker app is therefore the entry point for speakukrainian.org and the bridge to D1 and e-mail. The same bridge must work in local development, where the API runs as a plain Node process next to `wrangler dev`. Uploads up to 100 MB pass through the Worker, so bodies must be streamed, not buffered.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new gateway app in the monorepo forwards every request for speakukrainian.org to the API container and returns its response, including streamed uploads and downloads
- [x] #2 The API can run SQL against D1 through the gateway, both inside the container and from a local Node process against `wrangler dev`
- [x] #3 The bridge endpoints are not reachable from the public internet
- [x] #4 Environment variables and secrets reach the container without being baked into the image
- [x] #5 The gateway participates in pnpm lint, typecheck and build
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New workspace package apps/gateway (@speakukrainian/gateway): Worker entry, one Durable Object class that owns the API container, and a bridge module. Uses the Durable Object Container API directly (ctx.container) with scheduling_policy "durable_object"; the @cloudflare/containers helper and the default policy are deprecated in the current docs.
2. Routing: every public request goes to a single named Durable Object instance, which starts the container on demand (env passed at start), waits for /api/health, and proxies the request without buffering. Forwarded headers (proto, host, client IP) are set by the Worker.
3. Bridge: one WorkerEntrypoint registered with interceptOutboundHttp for the virtual host gateway.internal, serving POST /d1/query and POST /d1/batch from the D1 binding. Only the container can reach it. E-mail is left for TASK-49 on the same bridge.
4. Local mode (wrangler dev without Docker): containers disabled; when LOCAL_API_ORIGIN is set in .dev.vars the Worker proxies to the local Node API and exposes the same bridge under /__bridge, protected by BRIDGE_SECRET. In container mode /__bridge is never served by the Worker.
5. Env and secrets: every string-valued Worker var/secret is handed to the container at start, plus BRIDGE_URL. Nothing is baked into the image.
6. Verification: unit tests for the bridge; a smoke configuration (apps/gateway/smoke) that runs a small stub image under local Docker to prove proxying, streaming, env passing and the D1 intercept, since the real API image cannot boot until it is off Postgres/Supabase (TASK-42/43/52).
7. Wire lint, typecheck, test and build (wrangler deploy --dry-run) into turbo via the package scripts. No production deploy in this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: implemented apps/gateway (@speakukrainian/gateway).
- src/index.ts: Worker entry; container mode sends everything to the single ApiContainer instance; local mode (LOCAL_API_ORIGIN in .dev.vars) proxies to the Node API and serves the bridge under /__bridge behind x-bridge-secret. Sets x-forwarded-proto/host/for and strips Expect.
- src/api-container.ts: Durable Object using ctx.container (durable_object policy). Starts on demand, passes every string var/secret plus BRIDGE_URL as env, waits for /api/health, 30 min inactivity timeout, 503 with retry-after when the container is not answering.
- src/bridge.ts: POST /d1/query and /d1/batch on host gateway.internal; SQL errors come back as 422 with the SQLite message.
- smoke/: stub image + wrangler config to run the real gateway code in container mode under local Docker.
- wrangler.jsonc carries the production D1 id and the speakukrainian.org custom domain; local dev has containers disabled.
- Root: .gitignore/.prettierignore/.dockerignore entries for .wrangler, .dev.vars and worker-configuration.d.ts; launch.json entries gateway (8787) and gateway-smoke (8788).

Findings worth keeping:
- Forwarding `Expect: 100-continue` to the container port fails the request with an empty 500 (curl sends it for bodies over 1 MB). Stripped in the Worker.
- After the Worker reloads while the container keeps running, an intercept registered by the previous Durable Object instance stops answering ("fetch failed" inside the container). The intercept is now re-registered once per object instance.
- `wrangler deploy --dry-run` builds the container image; the build script uses --containers-rollout=none so pnpm build needs no Docker.
- The API contract for TASK-42: BRIDGE_URL (http://gateway.internal in the container, http://localhost:8787/__bridge locally) and BRIDGE_SECRET (local only).

Verified locally (wrangler 4.167, Docker): smoke run - health through the proxy, env var and BRIDGE_URL visible in the container, spoofed x-forwarded-* overwritten, 100 MB upload with content-length and chunked, 100 MB download, D1 query and batch through the intercept, failing batch rolled back, /__bridge and /d1/query answer 404 from outside, bridge still works after Worker reloads. Local mode - 403 without or with a wrong secret, a Node process ran a batch and a query against local D1, proxy to a Node server on 8080 including a 20 MB streamed upload, 502 when the API is down. Unit tests: 10 for the bridge. pnpm lint, typecheck, test and build pass for the whole repo.

NOT verified: nothing is deployed. Behaviour on the real platform (custom domain, real container start, intercept after a real deploy, secrets) is unproven, and the real API image cannot boot in the container until it is off Postgres/Supabase (TASK-42, TASK-43, TASK-52). E-mail on the bridge is left to TASK-49. pnpm format:check fails only on the untracked .openidea/changelists.json, which is not part of this work.

2026-11-24 (production run): deployed the gateway as speakukrainian-gateway with the stub image on the custom domain speakukrainian.org (temporary config, since removed), then tore it down.
Results on the real platform: first request after deploy 200 in 7.4 s (cold start), warm 0.3 s; SMOKE_VAR, BRIDGE_URL and a Worker secret set with `wrangler secret put` all visible in the container; spoofed x-forwarded-for/host replaced, proto https, host speakukrainian.org; D1 query and batch through the intercept against the real database, failing batch rolled back; /__bridge/d1/query and /d1/query answer 404 from the internet and a request with Host: gateway.internal gets 403 at the edge; 99 MB upload with content-length (16.9 s) and chunked (12.4 s), 100 MB download; after a second `wrangler deploy` the bridge kept working (1.1 s, no cold start).
The account accepted the container deploy, which confirms the Workers Paid plan.
Teardown: smoke table dropped from D1 (database has no user tables), Worker deleted with `wrangler delete` (removes the custom domain and the secret), container application 330241f302b44bf1b0d65ef4dda9ccc2 and its registry image deleted. speakukrainian.org answers 530 again until the real deploy.
Note for TASK-55: `wrangler delete` does not remove the container application or its image; they have to be deleted separately.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added apps/gateway, the Worker that fronts speakukrainian.org: it runs the API container through a single Durable Object (Durable Object Container API, durable_object policy), streams requests and responses through, passes vars and secrets as container env, and exposes D1 to the container on the intercepted host gateway.internal (POST /d1/query, /d1/batch). In local development it runs without Docker, proxies to the Node API and serves the same bridge under /__bridge behind a shared secret.

Verified with a stub image both under local Docker and deployed on speakukrainian.org (proxying, 99-100 MB streamed upload and download, env and secrets, D1 query and atomic batch, bridge unreachable from outside, bridge intact after redeploy), then torn down. Unit tests cover the bridge; lint, typecheck, test and build pass repo-wide.

Risks and follow-ups: the real API image has not run in the container yet (TASK-42, TASK-43, TASK-52); e-mail on the bridge belongs to TASK-49; cold start measured at about 7 s with a trivial image, so the real API will be slower on the first request after 30 idle minutes; nothing is currently deployed.
<!-- SECTION:FINAL_SUMMARY:END -->
