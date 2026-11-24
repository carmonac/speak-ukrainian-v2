---
id: TASK-47
title: Chat polling instead of Realtime
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
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
- [ ] #1 An open admin conversation shows a new student message within a few seconds without a reload
- [ ] #2 The student messages page and the unread badge update within a few seconds of an admin reply
- [ ] #3 Polling stops while the tab is hidden or the user is signed out
- [ ] #4 No Realtime subscription code or realtime-only shared constants remain
<!-- AC:END -->
