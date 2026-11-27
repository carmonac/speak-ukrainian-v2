---
id: TASK-65
title: C4L-style highlight components in the rich-text editor
status: To Do
assignee: []
created_date: '2026-11-27T15:24:33Z'
labels:
  - admin
  - student
  - site
dependencies:
  - TASK-62
references:
  - https://moodle.org/plugins/tiny_c4l
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The administrator writes course texts on Moodle with the C4L ("Components for Learning", the `tiny_c4l` TinyMCE plugin) blocks that highlight text: key concept, tip, reminder, quote, do/don't, attention, example, estimated time, learning outcomes and similar. She wants the same kind of blocks in our rich-text editor so she can format summaries and descriptions the way she is used to. They must be our own recreation (own styles and icons), not copied assets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The rich-text editor offers a menu of highlight blocks covering the main C4L component kinds (at least key concept, tip, reminder, quote, attention, do/don't, example)
- [ ] #2 A block can be inserted, its text edited, and removed or converted back to a paragraph
- [ ] #3 The API sanitizer keeps the blocks markup and drops anything else
- [ ] #4 The blocks look the same in the editor, the student app and the public site, in light and dark themes
- [ ] #5 Tests cover sanitizing and rendering the blocks
<!-- AC:END -->
