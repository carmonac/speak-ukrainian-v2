---
id: TASK-47
title: Chat polling instead of Realtime
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-24T23:12:59Z'
labels:
  - admin
  - student
milestone: m-5
dependencies:
  - TASK-43
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both apps learn about new chat messages through Supabase Realtime (postgres_changes on the messages table): apps/admin/src/app/features/users/conversation-page.ts and apps/student/src/app/core/session.store.ts. Realtime disappears with Supabase. The owner chose plain polling over a WebSocket service because this is a low-volume support chat. The API container sleeps when idle, so background tabs should not keep it awake.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An open admin conversation shows a new student message within a few seconds without a reload
- [x] #2 The student messages page and the unread badge update within a few seconds of an admin reply
- [x] #3 Polling stops while the tab is hidden or the user is signed out
- [x] #4 No Realtime subscription code or realtime-only shared constants remain
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: done as part of TASK-45 (admin) and TASK-46 (student), because removing the Supabase SDK from each app removed its Realtime channel.
- Admin conversation page: polls the thread every 5 s. Student: MessagesPage polls its thread every 5 s; SessionStore polls the unread count every 20 s and the shell also refreshes it on every navigation. All three only while document.hidden is false, with an immediate refresh on visibilitychange; the SessionStore timer exists only while signed in.
- MESSAGES_TABLE removed from packages/shared; no Realtime code is left in either app.
Verified in the browser: a student message appeared in the open admin conversation without a reload (4 polls in 17 s); an admin reply appeared in the open student thread within 7 s; the student badge appeared on another page after the next poll; signed out, 25 s on /courses made no /me calls; with document.hidden forced to true, 25 s on /messages made 0 API calls, and 2 fired at once on becoming visible again.
Note: the badge can lag up to 20 s on a page the student stays on; the thread itself up to 5 s.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T22:59:28Z

---

From TASK-45: the admin conversation page already polls (every 5 s while visible, and on visibilitychange) and no longer imports MESSAGES_TABLE. Left for this task: the student app, the unread badge refresh, and removing MESSAGES_TABLE from packages/shared.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Both apps now learn about new chat messages by polling the API instead of Supabase Realtime: every 5 s for an open thread and every 20 s for the student unread badge, only while the tab is visible and the user is signed in. The work landed with TASK-45 and TASK-46; this task records and verifies it. Measured in the browser, including zero requests from a hidden tab and from a signed-out visitor.
<!-- SECTION:FINAL_SUMMARY:END -->
