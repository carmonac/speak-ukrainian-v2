---
id: TASK-64
title: Rich-text course description
status: Done
assignee:
  - '@claude'
created_date: '2026-11-27T15:24:33Z'
updated_date: '2026-11-27T15:50:14Z'
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
- [x] #1 The course description in the control panel uses the same rich-text editor as the summary
- [x] #2 The API sanitizes the description with the same allowlist before saving
- [x] #3 The description renders as formatted HTML in the student app and on the public site
- [x] #4 Existing plain-text descriptions are converted by a migration so they read the same
- [x] #5 Plain-text uses of the description derive text from the HTML
- [x] #6 Tests cover sanitizing and rendering the description
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared: the description becomes sanitized HTML with the same length cap as the summary (`MAX_COURSE_DESCRIPTION_LENGTH`).
2. API: `toStoredRichText(description)` on create/update. `CourseDetail`/`CourseOutline` keep returning it as HTML.
3. Admin: replace the description textarea with `app-rich-text-editor`.
4. Student course page: render the description with `[innerHTML]` and the `.rich-text` styles.
5. Public site: the published-course list loads the description too, and templates get `{{ description }}` (SafeString) and `{{ descriptionText }}`; document both in docs/pages.md.
6. Migration 0005 converts existing plain-text descriptions like 0004 did for summaries.
7. Tests (service, renderer, migration), docs, browser check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Browser checks (local):
- The control panel shows two Tiptap editors (summary, description). The description received bold text, an emoji and an uploaded picture (stored as a site file in R2). The save answered "Course saved".
- The API stored the sanitized HTML.
- The student course page renders it under "About this course".
- A page preview with `{{#each courses}}{{ description }}{{ descriptionText }}` renders the HTML and the plain text.
- Local migration 0005 turned the old description "d" into "<p>d</p>".
Tests:
- Service: sanitizing, plain text to paragraphs, `listPublished`.
- Renderer: description and descriptionText.
- Gateway: 0004 and 0005 conversions.
- Lint, typecheck, test (788 API), format and build all pass.
The catalogue list and Stripe never showed the description, so the only plain-text use is the new `descriptionText` for templates.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The course description is rich text like the summary:
- The control panel edits it with the same Tiptap editor (formatting, emojis, pictures and videos uploaded to R2).
- The API stores it through `toStoredRichText`, which sanitizes HTML and wraps plain text.
- The student course page renders it with `[innerHTML]` and the shared `.rich-text` styles.
- Public-site templates get `{{ description }}` (HTML) and `{{ descriptionText }}` in `{{#each courses}}`, from a new `CoursesService.listPublished`.
Migration 0005 converts existing plain-text descriptions, and the length cap is now 50,000 characters of HTML. Docs (pages.md, architecture.md) are updated, and tests cover the sanitizer, renderer and migration.
Deploying needs the `db` step for migration 0005.
<!-- SECTION:FINAL_SUMMARY:END -->
