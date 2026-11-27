---
id: TASK-36
title: Documentation
status: Done
assignee: []
created_date: '2026-11-24T15:06:44Z'
updated_date: '2026-11-27T19:01:03Z'
labels:
  - docs
milestone: m-4
dependencies: []
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/architecture.md, docs/deployment.md (VPS, Supabase Cloud, Stripe, SendGrid, DNS) and docs/h5p.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new deployment can be done by following deployment.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Written: README.md, docs/architecture.md, docs/deployment.md, docs/h5p.md, docs/pages.md. NOT verified: nobody has yet deployed to a real VPS + Supabase Cloud by following deployment.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
README.md, docs/architecture.md, docs/deployment.md, docs/h5p.md and docs/pages.md written. The original scope (VPS, Supabase Cloud, SendGrid) was superseded by the Cloudflare migration (M5); deployment.md now covers the Cloudflare stack and pnpm deploy:prod. The production deployment of 2026-11-25 on speakukrainian.org followed it (see TASK-56). Closed by the owner on 2026-11-27.
<!-- SECTION:FINAL_SUMMARY:END -->
