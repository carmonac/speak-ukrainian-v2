---
id: TASK-59
title: Storage section in the admin panel for site files
status: Done
assignee:
  - '@claude'
created_date: '2026-11-25T09:39:29Z'
updated_date: '2026-11-25T09:57:03Z'
labels:
  - admin
  - api
milestone: m-6
dependencies:
  - TASK-58
references:
  - apps/admin/src/app/layout/shell.html
  - apps/admin/src/app/app.routes.ts
  - apps/api/src/infra/storage/storage.service.ts
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once administrators can upload files for their pages (TASK-58), they need one place to see everything they have uploaded, check a file, grab its URL again and remove files they no longer use. Without it, uploaded files are only visible at the moment of upload and accumulate in R2 forever. The section covers only site files, not H5P content, which is managed through courses. Deleting a file that a page still links to breaks that page; the confirmation should make that risk clear. Details beyond name and URL (size, upload date) are shown only when R2 provides them; do not add storage just to track metadata that R2 does not keep.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The admin side menu has a new Storage item that opens a list of all uploaded site files
- [x] #2 The list is paginated when there are more files than fit on one page
- [x] #3 Each row shows the file name and three actions: open, details and delete
- [x] #4 The open icon opens the file URL in a new browser tab
- [x] #5 The eye icon opens a popup with the file URL, name, size and upload date, showing whichever of these R2 provides
- [x] #6 The trash icon asks for confirmation and, if confirmed, deletes the file from R2 and removes it from the list
- [x] #7 Listing and deleting are admin-only API routes; H5P content never appears in the list and cannot be deleted from here
- [x] #8 API tests cover listing with pagination, deletion and authorization
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API (admin only), on top of TASK-58: GET /api/admin/files?limit&offset returns a page of site files (newest first) with name, URL, size and upload date, all of which R2 provides in its listing, so no extra storage; DELETE /api/admin/files/:id removes one upload. Both only ever look under site/files/.
2. Admin panel: a Storage item in the side menu and a /storage screen with a paginated table; per row an open action (new tab), a details popup (URL, name, size, upload date, with copy) and a delete action whose confirmation warns that pages linking to the file will break.
3. Tests in the same Nest test application: pagination (limit, offset, total, order), deletion, 404 for an unknown id, authorization, and that H5P objects are neither listed nor deletable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. API: GET /api/admin/files?limit&offset (newest first, total) and DELETE /api/admin/files/:id (UUID only, 404 when missing), both admin only and confined to the site/files/ prefix. Admin: /storage route and Storage item in the side menu; server-paginated table (25 per page) with open-in-new-tab, details popup (name, URL with copy, size, upload date: what R2 keeps) and delete behind a confirmation that warns linked pages will break. Verified in the browser on the local stack: list, details popup, confirmation and deletion. pnpm lint, typecheck, test (730 API tests), build and format:check pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The control panel has a Storage section listing every site file with pagination. Each row can be opened in a new tab, inspected in a popup (URL, name, size, upload date) or deleted after a confirmation that warns pages linking to it will stop showing it. Listing and deletion are admin-only and never see or touch H5P objects; the spec covers pagination, deletion, authorization and attempts to point the routes outside the prefix. Not deployed to production yet.
<!-- SECTION:FINAL_SUMMARY:END -->
