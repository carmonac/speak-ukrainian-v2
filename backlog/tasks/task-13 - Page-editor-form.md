---
id: TASK-13
title: Page editor form
status: Done
assignee: []
created_date: '2026-11-24T15:06:41Z'
updated_date: '2026-11-24T15:46:21Z'
labels:
  - admin
milestone: m-1
dependencies:
  - TASK-10
  - TASK-12
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Form with title, URL path, texts (key + language dropdown + translation, 'Add more translation', add/remove texts) and a Monaco editor for the Handlebars content.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A text can have any number of translations, one per language
- [x] #2 Monaco edits HTML/Handlebars content
- [x] #3 Saving persists and reloads correctly; same form for main and custom pages
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Page editor: title, URL path, texts with language dropdown and 'Add more translation', Monaco editor (Handlebars). Verified in the browser: added a third translation, saved, and the public page served it.
<!-- SECTION:FINAL_SUMMARY:END -->
