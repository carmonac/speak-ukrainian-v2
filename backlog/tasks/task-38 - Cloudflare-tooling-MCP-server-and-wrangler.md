---
id: TASK-38
title: 'Cloudflare tooling: MCP server and wrangler'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:42Z'
updated_date: '2026-11-24T22:42:28Z'
labels:
  - infra
milestone: m-5
dependencies: []
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
All hosting moves to Cloudflare and every deploy runs from a developer machine, never from GitHub Actions. Agents and the deploy script need two things first: the Cloudflare API MCP server (https://mcp.cloudflare.com/mcp) to manage account resources, and wrangler to build and deploy. Neither is set up: wrangler is not installed and the MCP server needs a one-time OAuth authorisation by the account owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A project-level .mcp.json registers the cloudflare-api MCP server and is committed
- [x] #2 wrangler is a root dev dependency and `pnpm exec wrangler whoami` reports the account that owns speakukrainian.org
- [x] #3 The Cloudflare MCP tools can list the account and the speakukrainian.org zone
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: .mcp.json added (cloudflare-api, HTTP) and authorised by the owner; the MCP lists the account and the speakukrainian.org zone. wrangler 4.167.0 added as a root dev dependency; workerd allowed in pnpm-workspace.yaml allowBuilds.
Pending: `pnpm exec wrangler whoami` reports "not authenticated" - the owner has to run `pnpm exec wrangler login` once. Nothing committed yet.

2026-11-24 (later): owner ran `wrangler login`; `pnpm exec wrangler whoami` reports the account bc185fa990014c1b4c5be0eda8a48429 and wrangler lists the D1 database and the R2 bucket. `wrangler containers list` answers without an entitlement error. Remaining before finalising: commit .mcp.json, package.json, pnpm-lock.yaml and pnpm-workspace.yaml.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Registered the Cloudflare API MCP server in .mcp.json (authorised by the account owner), added wrangler 4.167 as a root dev dependency and allowed workerd builds in pnpm-workspace.yaml. Verified: the MCP lists the account and the speakukrainian.org zone, and `pnpm exec wrangler whoami` reports the account after `wrangler login`. Committed on branch m5-cloudflare-migration.
<!-- SECTION:FINAL_SUMMARY:END -->
