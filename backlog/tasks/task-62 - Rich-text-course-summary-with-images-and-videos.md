---
id: TASK-62
title: Rich-text course summary with images and videos
status: Done
assignee:
  - '@claude'
created_date: '2026-11-27T13:07:17Z'
updated_date: '2026-11-27T13:22:39Z'
labels:
  - admin
  - api
  - student
  - site
dependencies: []
documentation:
  - docs/pages.md
  - docs/architecture.md
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The course summary in the admin course editor is a plain textarea, so the administrator (non-technical) cannot format it, add emojis or show a picture or a short video of the course. She wants a simple, friendly editor. The summary is shown in the student app (catalogue, course page, my courses), is sent to Stripe Checkout as the product description, and the public Handlebars site has no access to courses at all yet. Stored HTML reaches other people's browsers, so it must be sanitized on the API before saving, and every plain-text use must get text derived from it instead of raw markup. Uploaded media should reuse the existing site file uploads (R2, Storage section) rather than a new storage path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The course editor summary is a rich-text editor with bold, italic, underline, headings, bulleted and numbered lists, links and an emoji picker
- [x] #2 Images and videos can be uploaded from the editor; they are stored as site files in R2 and appear in the Storage section
- [x] #3 The summary is stored as HTML, sanitized on the API against an allowlist of tags, attributes and URL schemes before it is saved
- [x] #4 Existing plain-text summaries keep displaying correctly after the change
- [x] #5 The student course page renders the formatted summary, including images and playable videos
- [x] #6 Course cards and Stripe Checkout use plain text derived from the summary, never raw markup
- [x] #7 Public site templates can list published courses with their formatted summary and its plain text
- [x] #8 Tests cover the sanitizer and the plain-text derivation; lint, typecheck, test and format:check pass
- [x] #9 docs/pages.md and docs/architecture.md describe the summary format and the new template value
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared: allow a longer HTML summary (`MAX_COURSE_SUMMARY_LENGTH`), add `summaryText` to `CourseSummary`.
2. API: `courses/rich-text.ts` with `sanitizeRichText` (sanitize-html allowlist: p, br, h2, h3, strong, em, u, s, ul, ol, li, blockquote, a[href,target,rel], img[src,alt,title], video[src,controls,poster,title]; http/https, plus mailto for links; target=_blank gets rel=noopener noreferrer; video always gets controls; empty paragraphs at the edges dropped), `richTextToPlain` (block-aware, entity-decoded, whitespace-collapsed, shortened) and `toStoredRichText` (plain text without markup becomes escaped paragraphs). Sanitize in CoursesService on create/update; derive `summaryText` in `toCourseSummary`; Stripe gets the plain text.
3. Migration 0004_course_summary_html.sql: escape existing plain summaries and wrap them in <p>, line breaks as <br>.
4. Public site: `PublishedCourses` (60 s TTL, cleared by the admin course controller on create/update/delete) feeding a `courses` template value (title, slug, url, price, free, lessonCount, summary as a SafeString, summaryText); loaded only when the template mentions `courses`; also used by the page preview.
5. Admin: standalone `RichTextEditor` (`core/rich-text-editor.ts`) on Tiptap, two-way `value` model like `app-code-editor`, ng-zorro toolbar: bold, italic, underline, two heading sizes, lists, link popover, emoji popover, picture/video upload through `AdminApi.uploadFile` (site files), undo/redo. Replaces the summary textarea.
6. Student: course page renders the summary with [innerHTML] (Angular sanitizer as a second layer) and global `.rich-text` styles; catalogue and my-courses cards use `summaryText`.
7. Tests, docs, browser verification on the dev servers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Editor choice: Tiptap 3 (ProseMirror). It is framework-agnostic, so it is driven imperatively from one Angular component with no zone dependency (works zoneless; signals are updated from its `update`/`selectionUpdate` events). It is actively maintained (weekly releases), outputs clean semantic HTML that maps 1:1 to the API allowlist, ships bold/italic/underline/heading/list/link in StarterKit plus an Image node, and a `<video>` node is a few lines as a custom Node. Quill 2 was the alternative: its last release is from January 2025, it only embeds videos as iframes, and its toolbar/theme CSS clashes with ng-zorro. The toolbar is built with ng-zorro buttons, so it matches the panel. Pinned to 3.33.1 (released more than two weeks ago).

Verification (local dev servers from .claude/launch.json): in the admin, a summary was written with a heading, bold/italic/underline, the 🇺🇦 emoji from the picker, a bulleted list, a link (typed as speakukrainian.org, stored as https://speakukrainian.org with target=_blank rel=noopener noreferrer), an uploaded PNG and an uploaded WebM, then saved. GET /api/courses returned the sanitized HTML and summaryText. Student app: the catalogue card shows the plain text; the course page shows the formatting, the image (naturalWidth 480) and a video with controls that played (readyState 4). Public site: a temporary page with {{#each courses}} rendered the summary, image and playable video, and a <meta name="description"> from summaryText; the page was deleted afterwards. Both uploads are listed by GET /api/admin/files (Storage).

Found and fixed during verification: after a picture is inserted Tiptap keeps it selected (NodeSelection), so the next upload or emoji replaced it. `insert()` now inserts after a selected node.

The page preview (sandboxed, opaque origin) could not show the images in the in-app browser pane: the pane itself refuses those loads (ERR_BLOCKED_BY_CLIENT). The same files load on the real site and in the student app, and the file route already sends CORP cross-origin and ACAO *; not changed.

Deploy note: migrations run before the API (docs/deployment.md). Between migration 0004 and the new API, the old API serves the migrated summaries as text, so cards briefly show "<p>…</p>" literally. Short window; acceptable.

Local leftovers: two unused uploads (ukraine-flag.png, intro.webm) from the attempt that exposed the selection bug remain in the local Storage section; deleting them was blocked by a permission check, they can be removed from Storage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The course summary is now rich text. The admin course editor uses a new Tiptap-based `RichTextEditor` (bold, italic, underline, two heading sizes, lists, links, an emoji picker, picture and video uploads, undo/redo) with an ng-zorro toolbar. Pictures and videos are uploaded through the existing site-file route, so they live in R2 under site/files/ and appear in Storage.

The API sanitizes the summary on create and update with sanitize-html against a strict allowlist (`apps/api/src/courses/rich-text.ts`) and derives `summaryText`, plain text used by course cards, Stripe Checkout and meta tags. Migration 0004 turns existing plain summaries into escaped paragraphs. The student course page renders the HTML with [innerHTML]. Public-site templates get a new `courses` value (cached and cleared on course save) with the formatted summary and its plain text, and the page preview gets it too.

Tests: sanitizer and plain-text derivation (20 cases), sanitize-on-save, the courses template value, the cache, the preview, and the Stripe description. lint, typecheck, test (API 770), format:check and build pass. Verified end to end in the browser on the local admin, student app and public site. Docs: docs/pages.md (`courses` value), docs/architecture.md (summary format and security). Risk: a short window during deploy where the old API shows the migrated HTML as text in cards.
<!-- SECTION:FINAL_SUMMARY:END -->
