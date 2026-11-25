---
id: TASK-58
title: Upload site files to R2 from the page editor
status: Done
assignee:
  - '@claude'
created_date: '2026-11-25T09:39:16Z'
updated_date: '2026-11-25T09:57:03Z'
labels:
  - admin
  - api
  - site
milestone: m-6
dependencies: []
references:
  - apps/api/src/infra/storage/storage.service.ts
  - apps/admin/src/app/features/pages/page-editor.ts
  - apps/api/src/site/site.service.ts
documentation:
  - docs/pages.md
  - docs/architecture.md
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Page templates have nowhere to keep their own images, PDFs or other assets: an administrator writing a page in the panel has to host files elsewhere and paste external links. The page editor should let them upload a file and get back a URL they can paste into the Handlebars template. Files live in the existing private R2 bucket (`StorageService`), which today holds only H5P content and is never public: every byte a browser gets is streamed through the API. Site files therefore need their own prefix in the bucket and a public route on the site that serves them (anonymous visitors must be able to load them), kept separate from H5P content so that route never exposes anything else. Uploads are admin-only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The create and edit page screens have a section to upload one or more files
- [x] #2 After an upload the editor shows the public URL of each file with a way to copy it for use in the template
- [x] #3 An anonymous visitor can load an uploaded file from that URL, served with its content type and a long-lived cache header
- [x] #4 The public route only serves site files; H5P content and other bucket paths are not reachable through it
- [x] #5 Only administrators can upload; the upload has a size limit and rejects files over it with a clear message
- [x] #6 Two files with the same name do not overwrite each other
- [x] #7 API tests cover upload authorization, the size limit and serving a file publicly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bucket layout: site files live under the prefix site/files/<uuid>/<name>, apart from h5p/. The uuid makes two files with the same name distinct and gives each upload an address that never changes, so it can be cached for a year.
2. API (admin only): POST /api/admin/files, multipart field `file`, limit 25 MB with a clear 413. Names are sanitised (no path separators or control characters, length bound) and kept readable.
3. Public route on the site: GET /files/<uuid>/<name>, served by the site middleware by streaming from the bucket with the content type derived from the extension, a one-year immutable cache header, Range support for media and HEAD. The key is always built as site/files/ + a validated uuid + one name segment, so nothing else in the bucket can be addressed. /files becomes a reserved page path.
4. Page editor: a Files card on the create and edit screens to pick one or more files, upload them and show each public URL with a copy button.
5. Tests: a small Nest application with the real guards, the real multer interceptors and an in-memory bucket - authorization (anonymous, student, admin), the size limit and its message, same-name uploads, public serving (type, cache header, range), and that H5P paths are unreachable through /files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. API: FilesModule (POST/GET/DELETE /api/admin/files, admin only) and the public route GET/HEAD /files/<id>/<name> served by SiteService with Content-Type by extension, Cache-Control 'public, max-age=31536000, immutable', Range support and cross-origin headers so the sandboxed preview can load the files. Keys are site/files/<uuid>/<name>; a new id per upload keeps same-name files apart. Limit 25 MB (MAX_SITE_FILE_BYTES), enforced by multer and pre-checked in the browser. Admin: Files card in the page editor (multi-file upload, URL list with Copy URL). Verified locally against the gateway and local R2 with curl and in the browser (upload of two files from /pages/new, URLs shown, copy button). pnpm lint, typecheck, test (730 API tests), build and format:check pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The page editor (new, edit and main page) has a Files card that uploads one or more files to R2 and lists each public URL with a Copy URL button. Files are stored under site/files/<uuid>/<name> and served to anyone at /files/<uuid>/<name> with the right content type and a one-year immutable cache header; the route accepts only that shape, so H5P objects are unreachable. Upload is admin-only, limited to 25 MB with a message that names the limit. Covered by apps/api/src/files/files.http.spec.ts (real guards, multer and an in-memory bucket over HTTP). Not deployed to production yet.
<!-- SECTION:FINAL_SUMMARY:END -->
