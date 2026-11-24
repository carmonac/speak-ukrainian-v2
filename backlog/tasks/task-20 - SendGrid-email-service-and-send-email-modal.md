---
id: TASK-20
title: SendGrid email service and send-email modal
status: Done
assignee: []
created_date: '2026-11-24T15:06:42Z'
updated_date: '2026-11-24T15:46:21Z'
labels:
  - admin
  - api
  - email
milestone: m-1
dependencies:
  - TASK-18
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
EmailService on SendGrid (console transport in dev) and a modal to email a user from their detail page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Modal sends subject and body to the user
- [x] #2 Sent emails are logged
- [x] #3 Without an API key the console transport is used
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
EmailService (SendGrid, or the log when no key) and Send email modal. Verified in the browser with the console transport; each send is recorded in email_log. Real SendGrid delivery needs an API key and was not exercised.
<!-- SECTION:FINAL_SUMMARY:END -->
