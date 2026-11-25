---
id: TASK-49
title: EmailService on Cloudflare Email Sending
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-24T23:43:46Z'
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
- [x] #1 An admin-written e-mail and a chat reminder are delivered to an external mailbox from an address on speakukrainian.org
- [x] #2 Password-reset e-mails from better-auth are sent through the same service
- [x] #3 Every send, successful or failed, is still recorded in email_log
- [x] #4 Without e-mail configuration in local development the message is logged instead of sent
- [x] #5 The API has no dependency on @sendgrid/mail and no SENDGRID_API_KEY setting
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Gateway: send_email binding EMAIL (senders restricted to the no-reply address) and a bridge route POST /email/send { from, to, subject, text, html?, replyTo? } -> { messageId }. A refused send answers 502 with the provider message.
2. API: EmailService sends through the bridge when EMAIL_DELIVERY=send and only logs when it is "log" (the default, so local development needs no configuration). The gateway sets EMAIL_DELIVERY and EMAIL_FROM for the container. SendGrid package and key removed.
3. email_log gains status (sent, failed, logged) and error; a row is written for every attempt, and a failed send still throws to its caller. Migration 0003.
4. Password-reset e-mails already go through EmailService (TASK-43); covered by a test here.
5. Verify: unit tests on both sides; a real send to an external mailbox through the remote binding, once the owner names the recipient.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented; real delivery not yet tested.
- apps/gateway: send_email binding EMAIL restricted to the sender no-reply@speakukrainian.org; bridge route POST /email/send (502 with the provider message on a refusal); vars EMAIL_DELIVERY=send and EMAIL_FROM passed to the container. Migration 0003 adds status (sent, failed, logged) and error to email_log; applied to local and remote D1.
- apps/api: EmailService sends through the bridge when EMAIL_DELIVERY=send and only logs when it is "log" (default). Every attempt writes an email_log row with its outcome; a failed send is recorded and still rejects. @sendgrid/mail and SENDGRID_API_KEY removed.
- Tests: 11 for the bridge route, 6 for EmailService including a password reset issued by the real better-auth library arriving through it. Repo-wide lint, typecheck, test and build pass.
Pending for criterion 1: an actual send to an external mailbox (admin message and chat reminder). Plan: run the gateway locally with the send_email binding set to remote and the API with EMAIL_DELIVERY=send, once the owner names the recipient address.

2026-11-25 (real send, approved by the owner, to the owner's own mailbox): gateway run locally with the send_email binding set to remote, API with EMAIL_DELIVERY=send.
- First attempt used the stale local EMAIL_FROM (no-reply@example.com): the binding refused it ("email from no-reply@example.com not allowed"), the API answered 500 to the admin endpoint and email_log recorded both attempts as failed with that reason - the failure path works as designed.
- With the sender no-reply@speakukrainian.org: admin-written message (POST /admin/users/:id/email -> 204), password reset requested through better-auth, and a chat reminder sent by the scheduled job for a message backdated 30 hours. email_log shows the three as sent; the Cloudflare sending usage counter went to 2 after the first two.
- Account sending quota is 200 messages per day; reputation healthy, no suppressions.
Not confirmed from here: that the three messages reached the inbox (and not spam). That needs the owner to look. The local .env still has the old EMAIL_FROM value; production takes it from the gateway vars.

2026-11-25: the owner confirmed that the three test messages (admin message, password reset, chat reminder) arrived in the external mailbox.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
E-mail is sent with Cloudflare Email Sending through the gateway bridge, from no-reply@speakukrainian.org; SendGrid is gone. Delivery is off by default (messages are logged) and switched on by the gateway in production. Every attempt is recorded in email_log with its outcome and, on failure, the reason. Verified with unit tests on both sides and a real send of an admin message, a password reset and a scheduled chat reminder, which the owner confirmed receiving. Account quota is 200 messages per day.
<!-- SECTION:FINAL_SUMMARY:END -->
