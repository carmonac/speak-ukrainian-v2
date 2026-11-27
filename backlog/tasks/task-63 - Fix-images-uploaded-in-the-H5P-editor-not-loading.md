---
id: TASK-63
title: Fix images uploaded in the H5P editor not loading
status: Done
assignee:
  - '@claude'
created_date: '2026-11-27T15:24:33Z'
updated_date: '2026-11-27T15:41:15Z'
labels:
  - bug
  - h5p
dependencies: []
documentation:
  - docs/h5p.md
priority: high
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An image uploaded through the H5P editor (seen in an Information Wall panel) shows as a broken "?" thumbnail in the editor, in the preview, in the student course and after saving. Opening the image URL answers 400 "The requested file path is not valid." The requested URL embeds the editor AJAX endpoint as the file path, e.g. `/api/h5p/play-files/<token>/<contentId>//api/h5p/ajax?token=<editor token>&action=files&`, so the path stored in the content parameters, or the one the client builds, is the AJAX files URL instead of the uploaded file path (`images/<name>.png#tmp` while editing, `images/<name>.png` after saving). Read `docs/h5p.md` before touching `apps/api/src/h5p/` or the front-end `h5p/` folders.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An image uploaded in the H5P editor shows in the editor right after upload
- [x] #2 The same image shows in the editor preview, after saving, and in the student player
- [x] #3 The saved content parameters store a relative file path, not an AJAX URL
- [x] #4 Exercises already saved with the broken path are repaired or the fix explains how to re-upload
- [x] #5 A test covers the file path the editor receives for an uploaded file
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Root cause (from production logs and R2): the editor URL token lasts 2 hours (temporaryFileLifetime). An image uploaded later got a 401, and our error body carries `path: <request url>`. H5P's FileUploader only treats `success:false` / `error` as a failure, so it stored the request URL as the image path. On save, lumi deleted the original images it no longer referenced. The upload was prompted by broken thumbnails: reopening saved content builds `<url>/content/<id>/<file>`, a route that does not exist.
1. Answer H5P AJAX errors in H5P's format (`success:false`, `message`, no `path`) so the editor shows the error instead of storing a URL.
2. Make an editing session last a working day: raise temporaryFileLifetime (token and temp files) from 2h to 12h.
3. Give the editor model `contents[cid-<id>].contentUrl` (the play-files URL with a play token) so saved files preview in the editor.
4. Tests, docs/h5p.md, browser check; the broken production exercise needs its images uploaded again.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- Production telemetry: at 14:34:29 `POST /api/h5p/ajax?action=files` returned 401. The editor token had expired at 13:08, two hours after it was issued. The next request was the image at `content/<id>//api/h5p/ajax?...action=files`.
- Production R2 holds only `content.json` and `h5p.json` for exercise 606df321.
Local browser checks:
- Uploading an image shows it immediately (temp URL).
- The berries package goes through the Upload tab, save, and reopen. Paths stay `images/file-*.jpg`, and thumbnails load through `play-files` (naturalWidth 400; before the fix they got a 404 from `/content/<id>/...`).
- An upload with a bad token shows "That editing link is not valid." under the field and keeps the original image.
- The student player was not opened separately: it serves files from the same `play-files` route and the same relative paths.
Tests:
- `h5p-ajax.exception-filter.spec.ts`: `success:false`, no `path`.
- Controller metadata: only the ajax routes use the filter.
- Editor model: `contents[cid].contentUrl` carries a play token.
- Config: 12h session.
- All checks pass: 785 API tests, lint, typecheck, format.
Existing broken exercise: its images were deleted by the save that stored the URL, so they cannot be restored. The author has to upload the three images again in the editor (now safe) and save.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Images uploaded in the H5P editor broke because the editor token expired after 2 hours. The upload got a 401 whose JSON envelope carried `path: <request URL>`. H5P's uploader reads any body without `success:false` as a success, so it stored that URL as the image path, and the next save deleted the real images. Fixes:
- The ajax routes now answer errors in H5P's format (`H5pAjaxExceptionFilter`, a `shape()` hook on `HttpExceptionFilter`), so a refusal shows under the field.
- An editing session (token and temporary uploads) now lasts 12h instead of 2h.
- The editor model gives reopened exercises a `contentUrl` on the `play-files` route, so their thumbnails load instead of 404ing, which is what prompted the re-upload.
Verified in the browser and with tests; docs/h5p.md updated. Follow-up for the author: re-upload the three images of the production berries exercise (606df321), whose files are gone.
<!-- SECTION:FINAL_SUMMARY:END -->
