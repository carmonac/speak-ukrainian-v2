---
id: TASK-21
title: 24h unanswered-message reminder
status: Done
assignee: []
created_date: '2026-11-24T15:06:42Z'
updated_date: '2026-11-24T15:46:21Z'
labels:
  - api
  - chat
  - email
milestone: m-1
dependencies:
  - TASK-19
  - TASK-20
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hourly job: if an admin message is unread/unanswered after 24 hours, email the student that they have new messages (once).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reminder is sent once per unanswered batch
- [x] #2 No reminder if the student read or replied
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reminder job every 10 minutes. Verified by back-dating an unread admin message 25 hours: exactly one chat-reminder email was produced and the next run sent none; a thread where the student replied afterwards got no reminder.
<!-- SECTION:FINAL_SUMMARY:END -->
