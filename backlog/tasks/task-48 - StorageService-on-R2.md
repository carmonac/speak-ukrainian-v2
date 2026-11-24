---
id: TASK-48
title: StorageService on R2
status: To Do
assignee: []
created_date: '2026-11-24T21:25:20Z'
labels:
  - api
milestone: m-5
dependencies:
  - TASK-39
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
H5P content, libraries and temporary uploads live in a private Supabase Storage bucket reached through its S3 endpoint (apps/api/src/infra/storage), and the bucket is created at boot with supabase-js. Files move to Cloudflare R2, which is S3-compatible, so the S3 client can stay but the endpoint, credentials and bucket bootstrap change. Files are always streamed through the API, never served by signed or public URLs. Local development needs a storage answer too, since wrangler local R2 exposes no S3 endpoint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uploading an H5P package up to 100 MB stores it in R2 and the content plays back, including range requests for media
- [ ] #2 Deleting content removes every object under its prefix
- [ ] #3 The API starts without creating buckets and without supabase-js
- [ ] #4 Local development has a documented working storage backend
- [ ] #5 The bucket is not publicly readable
<!-- AC:END -->
