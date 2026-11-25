---
id: TASK-51
title: Admin and student apps on Workers static assets
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-24T23:48:30Z'
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
- [x] #2 Deep links such as /courses/123 load the app instead of a 404
- [x] #3 config.json is served with no-store and points at https://speakukrainian.org/api; hashed assets are immutable
- [x] #4 Responses carry nosniff, frame-deny and referrer-policy headers as the nginx setup did
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Each app becomes an assets-only Worker (no script): wrangler.jsonc with the production build directory, single-page-application fallback and its custom domain.
2. Headers through a `_headers` file shipped in the build (public/_headers): security headers on everything, no-store for config.json, one year immutable for the hashed build output only (main-, chunk-, polyfills-, styles-, media/). Unhashed files such as index.html, favicon and the Monaco editor keep the default revalidating cache; the old nginx rule cached every .js for a year, including those.
3. config.json per build configuration instead of being written at container start: ng serve copies the development one (localhost), ng build the production one (speakukrainian.org), so a production build cannot carry localhost URLs.
4. Scripts: `deploy` in each app (build + wrangler deploy).
5. Verify with wrangler dev over the production builds: deep links, config.json content and cache header, immutable assets, security headers; and a dry-run deploy. The real deploy to the custom domains waits for the owner's go-ahead or TASK-55.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented; not deployed.
- apps/admin and apps/student: wrangler.jsonc (assets-only Worker, no script; assets directory dist/<app>/browser; not_found_handling single-page-application; custom domains admin.speakukrainian.org and student.speakukrainian.org; workers_dev off). Scripts `preview` (wrangler dev over the build) and `deploy` (ng build && wrangler deploy).
- public/_headers in each app: nosniff, X-Frame-Options DENY and Referrer-Policy strict-origin-when-cross-origin on everything; no-store for /config.json; one year immutable for /main-*, /chunk-*, /polyfills-*, /styles-* and /media/*.
- config.json moved out of public/ into config/development and config/production, selected by the Angular build configuration (assets per configuration in angular.json): ng serve gets localhost, ng build gets https://speakukrainian.org/api (and the student URL for admin).

Verified with wrangler dev over the production builds, both apps: / and a deep link answer 200 with the app shell; config.json is no-store and carries the production URLs; main, chunk and styles files are immutable for a year; index.html, favicon and (admin) monaco/vs/loader.js revalidate; the three security headers are on every response, including the SPA fallback; _headers itself is not served. A development build carries the localhost config. `wrangler deploy --dry-run` reads the assets for both. Repo-wide lint, typecheck, test and build pass.
Not verified: the real deploy and the custom domains (criterion 1), and the headers as served by Cloudflare rather than the local simulator.
Known difference from nginx: a request for a file that does not exist (e.g. a chunk from a previous deploy) now gets index.html with 200 instead of 404.
Left for TASK-53: docker/spa.Dockerfile, spa-config.sh and spa.nginx.conf are now unused.
<!-- SECTION:NOTES:END -->
