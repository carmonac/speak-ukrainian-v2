---
id: TASK-50
title: Daily chat reminder via Cron Trigger
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-24T23:46:22Z'
labels:
  - api
  - infra
milestone: m-5
dependencies:
  - TASK-40
  - TASK-49
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
MessagesService.sendReminders() in apps/api/src/messages/messages.service.ts runs from an in-process @Cron every 10 minutes. In Cloudflare Containers the API sleeps when idle and may run several instances, so an in-process timer is unreliable and can double-send. The owner wants a Cloudflare Cron Trigger that calls the API once a day instead. The chat itself stays in MessagesService; only the scheduling changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Cron Trigger on the gateway calls an API endpoint once a day and reminders are sent for threads unanswered longer than CHAT_REMINDER_AFTER_HOURS
- [x] #2 The endpoint rejects calls that do not carry the shared secret
- [x] #3 A student is never reminded twice for the same unread message
- [x] #4 The API has no dependency on @nestjs/schedule and no in-process timers for reminders
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API: POST /api/internal/chat-reminders runs MessagesService.sendReminders() and answers { sent }. It is outside session auth and guarded by a shared secret (CRON_SECRET, header x-cron-secret, constant-time comparison); with no secret configured the endpoint is disabled. @Cron, ScheduleModule and @nestjs/schedule are removed.
2. Gateway: a Cron Trigger once a day (08:00 UTC) whose handler calls that endpoint - through the container binding in production, through LOCAL_API_ORIGIN in local mode - with the secret. The secret is a Worker secret, so the container receives the same value in its environment.
3. "Never reminded twice" is already guaranteed by reminder_sent_at being stamped before the e-mail is sent; covered by the existing MessagesService tests, plus a test of two consecutive runs through the endpoint.
4. Verify: unit tests on both sides; locally with wrangler dev --test-scheduled triggering the real handler against the running API.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented.
- apps/api: messages/reminders.controller.ts - POST /api/internal/chat-reminders, public to sessions, guarded by CRON_SECRET in the x-cron-secret header (constant-time comparison; 403 when wrong or missing, 503 when no secret is configured), answers { sent }. @Cron, ScheduleModule and @nestjs/schedule removed; the API has no timers for reminders.
- apps/gateway: src/cron.ts (runDailyJobs) and a scheduled handler; triggers.crons = ["0 8 * * *"] (08:00 UTC). In production it calls the container through the Durable Object binding, locally the Node API. CRON_SECRET is a Worker secret, so the container gets the same value in its environment; it must be created before the first deploy (`wrangler secret put CRON_SECRET`) - noted for TASK-55. The dev script now passes --test-scheduled.
- .env.example and .dev.vars.example carry a local CRON_SECRET.

Verification: 8 tests for the controller (right secret sends, second run sends nothing, four kinds of bad secret refused, disabled without a secret) and 3 for runDailyJobs; the 9 existing MessagesService tests cover the due/not-due rules. Live with wrangler dev --test-scheduled and the API on local D1: no secret -> 403, wrong secret -> 403, GET -> 404, no reminder produced by refused calls; triggering the scheduled event produced one chat-reminder e-mail for a student with a 30-hour-old unanswered message, stamped the messages, and a second trigger sent nothing; a student who had written after the admin message was correctly skipped. Gateway log: "Daily jobs done: {"sent":1}" then {"sent":0}. Repo-wide lint, typecheck, test and build pass.
Not verified: the Cron Trigger firing on Cloudflare and the call through the container binding (nothing is deployed) - to check in TASK-56.
Behaviour to know: with a daily run and a 24-hour threshold, a reminder can go out between 24 and 48 hours after the message.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Chat reminders are now driven by a Cloudflare Cron Trigger on the gateway, once a day at 08:00 UTC, which calls POST /api/internal/chat-reminders with a shared secret. The API no longer has an in-process timer or depends on @nestjs/schedule. Verified with unit tests and by triggering the scheduled event locally against the running API. The trigger itself has not yet fired on Cloudflare; that is part of the production smoke test, and the CRON_SECRET Worker secret must exist before the first deploy.
<!-- SECTION:FINAL_SUMMARY:END -->
