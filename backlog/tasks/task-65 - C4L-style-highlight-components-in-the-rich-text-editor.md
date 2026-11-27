---
id: TASK-65
title: C4L-style highlight components in the rich-text editor
status: Done
assignee:
  - '@claude'
created_date: '2026-11-27T15:24:33Z'
updated_date: '2026-11-27T20:29:43Z'
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
- [x] #1 The rich-text editor offers a menu of highlight blocks covering the main C4L component kinds (at least key concept, tip, reminder, quote, attention, do/don't, example)
- [x] #2 A block can be inserted, its text edited, and removed or converted back to a paragraph
- [x] #3 The API sanitizer keeps the blocks markup and drops anything else
- [x] #4 The blocks look the same in the editor, the student app and the public site, in light and dark themes
- [x] #5 Tests cover sanitizing and rendering the blocks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Our own recreation of C4L-style blocks: own names, colors and emoji icons, no copied assets.
1. Shared `rich-text-callouts.ts`: the list of kinds (key concept, tip, reminder, quote, attention, do, don't, example, estimated time, learning outcomes) with label and icon, plus one CSS string that styles `<div class="callout callout-<kind>">`. The label is drawn with `::before`, so the stored HTML stays plain. Colors use `color-mix(... transparent)` so they work on light and dark backgrounds.
2. API sanitizer: allow a `div` only as a callout with a known kind. Any other div is unwrapped to its contents. Callouts never nest.
3. Admin editor: a Tiptap `callout` node (wraps blocks except callouts) and a toolbar menu to insert a block, change its kind, or turn it back into plain paragraphs. Styles injected once from the shared CSS.
4. Student app: inject the shared CSS once. Public site: the renderer adds the CSS to pages whose output contains a callout.
5. Tests (sanitizer, renderer injection, shared CSS covers every kind), docs, browser check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Browser checks (local):
- The "Highlight box" toolbar menu lists 10 kinds.
- Tip wraps the current paragraph. The kind changes to Attention in place. "Remove the box" unwraps a two-paragraph box completely, with no split.
- Pasting HTML with all 10 kinds keeps them. Saving stores them sanitized.
- Student course page: all 10 render with label, colour and tint.
- Page preview on a dark background (#141414): styles injected before </head>, labels readable.
The student app has no dark theme, so "dark" was verified on the public site. Colours are translucent tints plus labels mixed with currentColor, so they adapt to any background.
Two display fixes made during testing:
- No-break spaces between icon and label, because generated content collapses ordinary spaces.
- Label colour mixed with currentColor, for contrast on dark backgrounds.
Also fixed a pre-existing editor bug found while testing: loading a course's text was undoable, so Undo right after opening a course emptied the field (and a save would store it empty). setContent now runs with addToHistory=false, and Undo starts disabled.
Tests:
- shared: kinds, CSS, class parsing.
- API sanitizer: every kind, class normalisation, unwrapping other divs, dangerous content inside a box, plain text.
- Renderer: style injection (head, no head, once, untouched without boxes).
- All checks pass: 796 API tests, lint, typecheck, format, build.
Note for local dev: after rebuilding `shared`, the Angular dev servers need their `.angular/cache` cleared and a restart, and the API a restart, to pick up new exports.

Follow-up: choosing a kind with part of a paragraph selected boxed the whole paragraph (wrapIn works on whole blocks). The editor now splits top-level text blocks at the selection edges first, trimming the spaces at the cut; a bare cursor still boxes its whole paragraph.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rich text (course summary and description) now has highlight boxes, our own take on Moodle's C4L blocks: key concept, tip, reminder, attention, do, don't, example, quote, estimated time and learning outcomes. They are stored as `<div class="callout callout-<kind>">` around ordinary blocks.
- `packages/shared/src/rich-text-callouts.ts` is the single source for kinds, labels, emoji icons, colours and the stylesheet. The label is drawn by CSS, and colours are translucent so they work on light and dark pages.
- The API sanitizer keeps only known callout divs with normalised classes, and unwraps any other div.
- The panel editor has a Tiptap `callout` node (no nesting) and a toolbar menu to insert a box, change its kind, or remove it while keeping the text.
- Both apps inject the stylesheet at startup. The public site's renderer adds it before `</head>` on pages that show a box.
- Also fixed: Undo right after loading a course no longer empties the editor.
Verified in the browser (editor, student page, dark site preview) and with tests. Docs are updated.
<!-- SECTION:FINAL_SUMMARY:END -->
