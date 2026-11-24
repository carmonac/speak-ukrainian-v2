---
id: TASK-49
title: EmailService on Cloudflare Email Sending
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
labels:
  - api
milestone: m-5
dependencies:
  - TASK-39
  - TASK-40
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/api/src/email/email.service.ts sends through SendGrid (@sendgrid/mail), and Supabase Auth sent its own e-mails through SendGrid SMTP. Everything is being centralised in Cloudflare, so SendGrid is dropped in favour of Cloudflare Email Sending (beta; Worker send_email binding or REST API). The two existing senders are the admin-written message (POST /admin/users/:id/email) and the chat reminder; password-reset and verification e-mails from better-auth now also go through this service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An admin-written e-mail and a chat reminder are delivered to an external mailbox from an address on speakukrainian.org
- [ ] #2 Password-reset e-mails from better-auth are sent through the same service
- [ ] #3 Every send, successful or failed, is still recorded in email_log
- [ ] #4 Without e-mail configuration in local development the message is logged instead of sent
- [ ] #5 The API has no dependency on @sendgrid/mail and no SENDGRID_API_KEY setting
<!-- AC:END -->
