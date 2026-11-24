---
id: TASK-19
title: Chat backend and admin conversation view
status: Done
assignee: []
created_date: '2026-11-24T15:06:42Z'
updated_date: '2026-11-24T15:46:21Z'
labels:
  - admin
  - api
  - chat
milestone: m-1
dependencies:
  - TASK-18
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
messages table API, Realtime select policies, and the admin conversation screen per student.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Admin and student see each other's messages in real time
- [x] #2 A student can only read their own thread
- [x] #3 Messages are marked read when viewed
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
messages table, API and Realtime policy; admin conversation screen and Conversations tab. Verified: a message sent by the student appeared live in the admin's open conversation and vice versa; a student reads only their own thread through PostgREST; opening a thread marks it read.
<!-- SECTION:FINAL_SUMMARY:END -->
