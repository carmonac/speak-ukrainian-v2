---
id: TASK-50
title: Daily chat reminder via Cron Trigger
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
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
- [ ] #1 A Cron Trigger on the gateway calls an API endpoint once a day and reminders are sent for threads unanswered longer than CHAT_REMINDER_AFTER_HOURS
- [ ] #2 The endpoint rejects calls that do not carry the shared secret
- [ ] #3 A student is never reminded twice for the same unread message
- [ ] #4 The API has no dependency on @nestjs/schedule and no in-process timers for reminders
<!-- AC:END -->
