---
id: TASK-64
title: Rich-text course description
status: To Do
assignee: []
created_date: '2026-11-27T15:24:33Z'
labels:
  - admin
  - student
  - site
dependencies:
  - TASK-62
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-62 made the course summary rich text (Tiptap editor in the control panel, HTML sanitized on the API, rendered in the student app and on the public site). The course description is still a plain textarea, and the administrator wants the same editor there: formatting, links, emojis, and images and videos uploaded to R2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The course description in the control panel uses the same rich-text editor as the summary
- [ ] #2 The API sanitizes the description with the same allowlist before saving
- [ ] #3 The description renders as formatted HTML in the student app and on the public site
- [ ] #4 Existing plain-text descriptions are converted by a migration so they read the same
- [ ] #5 Plain-text uses of the description derive text from the HTML
- [ ] #6 Tests cover sanitizing and rendering the description
<!-- AC:END -->
