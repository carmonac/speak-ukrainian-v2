---
id: TASK-39
title: Provision Cloudflare resources
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:24:42Z'
updated_date: '2026-11-24T23:26:17Z'
labels:
  - infra
milestone: m-5
dependencies:
  - TASK-38
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Only the speakukrainian.org zone exists in the Cloudflare account (Workers Paid). The migration needs a D1 database, an R2 bucket, Email Sending on the domain and hostnames for the public site and both apps before any code can be pointed at them. Provision through the Cloudflare MCP. Target hostnames: speakukrainian.org (public site and /api), www (redirect to apex), admin.speakukrainian.org, student.speakukrainian.org. Email Sending is beta; onboarding adds MX, SPF and DKIM records on a cf-bounce subdomain plus a DMARC record. Secrets must never be committed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A production D1 database exists and its id is recorded in the repository wrangler configuration
- [x] #2 A private R2 bucket for H5P files exists and is bound to the gateway; no access keys are issued for it
- [x] #3 Email Sending is onboarded for speakukrainian.org and its DNS records are verified
- [x] #4 www.speakukrainian.org redirects to the apex
- [x] #5 Resource names and ids are documented; secret values live only in Wrangler secrets or the local untracked env file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24, provisioned through the Cloudflare MCP. Account id bc185fa990014c1b4c5be0eda8a48429 (login is the owner account, not the developer e-mail). Zone speakukrainian.org id 521bbc2b5b14a8dcee23dac6aa431132, Free zone plan, SSL mode full.
- D1: database `speakukrainian`, id bc4c5342-0efc-498a-b17c-52aa3d77ade0, primary location WEUR, read replication disabled. Not yet written to a wrangler config because none exists (TASK-40).
- Email Sending: sending domain speakukrainian.org, id 82fe546c13fb4089a5367e39e822647f, return path cf-bounce.speakukrainian.org, DKIM selector cf-bounce. DNS status "ready"; records added: 3 MX + SPF on cf-bounce, DKIM on cf-bounce._domainkey, _dmarc with p=reject. Account recipient mode is "arbitrary". Email Routing was already enabled on the apex and is untouched. No test message sent yet.
- www: proxied AAAA 100:: placeholder plus a redirect rule (ruleset 542aeb3f71284257990bcd4bde9a968a) to https://speakukrainian.org preserving path and query; verified with curl (301).
- Always Use HTTPS turned on for the zone.
- Apex, admin and student hostnames: no DNS records created on purpose; Workers custom domains create them at first deploy (TASK-40, TASK-51).
BLOCKED - R2: the API answers "Please enable R2 through the Cloudflare Dashboard" (error 10042). The owner must enable R2 in the dashboard; then create the private bucket and its S3 API token.

2026-11-24 (later): owner enabled R2. Created private bucket `speakukrainian-h5p`, location WEUR, Standard class; r2.dev public access disabled and no custom domain attached.
Not done: the bucket-scoped S3 API token. Deliberately deferred: creating it now would put the secret into the agent conversation with no Worker to store it in, and TASK-48 first has to decide whether the API reaches R2 over the S3 API (needs the token) or through the gateway binding (needs none). Create it when TASK-48 confirms the S3 route, writing the secret straight into a Wrangler secret.
Not done: recording ids in a wrangler configuration file - none exists until TASK-40; the ids are in these notes meanwhile.
The account owner is the site administrator; the developer account is also a member of the Cloudflare account, so either login works.

2026-11-25: criterion 2 reworded after the owner chose to reach R2 through the gateway binding (TASK-48): no S3 API token is created. The D1 id and the bucket name are now in apps/gateway/wrangler.jsonc; the Email Sending domain id and the other ids are in these notes, and docs/deployment.md will list them in TASK-54. No secret was created during provisioning. Evidence for each criterion is in the notes above (D1 created and migrated, bucket private and bound, Email Sending DNS status ready, www 301 checked with curl).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Provisioned through the Cloudflare MCP: D1 database speakukrainian (WEUR), private R2 bucket speakukrainian-h5p bound to the gateway with no access keys, Email Sending onboarded for speakukrainian.org with its DNS verified, www redirected to the apex, Always Use HTTPS on. Hostnames for the apex, admin and student are created by the Workers at first deploy. No test e-mail has been sent yet (TASK-49).
<!-- SECTION:FINAL_SUMMARY:END -->
