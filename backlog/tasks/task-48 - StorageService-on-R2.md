---
id: TASK-48
title: StorageService on R2
status: Done
assignee:
  - '@claude'
created_date: '2026-11-24T21:25:20Z'
updated_date: '2026-11-24T23:26:17Z'
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
- [x] #1 Uploading an H5P package up to 100 MB stores it in R2 and the content plays back, including range requests for media
- [x] #2 Deleting content removes every object under its prefix
- [x] #3 The API starts without creating buckets and without supabase-js
- [x] #4 Local development has a documented working storage backend
- [x] #5 The bucket is not publicly readable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision (owner, 2026-11-25): the API reaches R2 through the gateway bridge, not the S3 API. No credentials exist anywhere, production and local development use the same code path, and local development works with wrangler's simulated R2, without Docker or internet.
1. Gateway: R2 bucket binding and bridge routes for put, multipart upload (create, part, complete, abort), get with Range, stat, list (prefix, delimiter, cursor) and batch delete.
2. API: StorageService keeps its public interface but sits on an ObjectStoreDriver; the real one talks to the bridge, the tests use an in-memory one. Streams are cut into fixed-size parts: one part is a plain put, more become a multipart upload, so no single request approaches the 100 MiB limit of a container outbound request and nothing larger than a part is held in memory.
3. Remove @aws-sdk/client-s3, @aws-sdk/lib-storage and the STORAGE_* settings.
4. Verify: unit tests on both sides; the smoke container exercising R2 through the intercept; the API running locally against wrangler dev with the R2 binding pointed at the real bucket (remote binding), uploading and playing an H5P package, range requests and prefix delete.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented through the gateway bridge (owner decision, see plan).
- apps/gateway: R2 binding FILES -> bucket speakukrainian-h5p; bridge routes for put, get with Range (206 + Content-Range, 416 outside the object), stat, list, batch delete and multipart (create, part, complete, abort). handleBridge now takes { db, files } and routes on method + path.
- apps/api: infra/bridge/bridge.client.ts is the one HTTP client for the bridge (D1 driver and storage both use it; its timeout covers only the wait for an answer, never the reading of a download). infra/storage: ObjectStoreDriver contract, BridgeObjectStore, and StorageService with the same public interface as before. A stream is cut into 8 MiB parts: one part is a plain put, more become a multipart upload, aborted on any failure.
- Removed @aws-sdk/client-s3, @aws-sdk/lib-storage, STORAGE_BUCKET/STORAGE_S3_* settings and the S3 token injection. No access key for the bucket exists.
- Local development: wrangler simulates the bucket on disk under apps/gateway/.wrangler; documented in README.md.

Verification:
- Unit: 16 tests for the R2 bridge routes (fake bucket), 29 for StorageService and BridgeObjectStore (part cutting at exact and odd boundaries, abort on a failed part and on a failed source stream, 2,300-key prefix delete in batches of 1000, ranges, paging).
- Live, API (Node) -> wrangler dev -> local R2, then the same with the R2 binding set to remote (the real bucket speakukrainian-h5p): for a 1 MB and a 99 MB H5P package (103.8 MB media file, 13 parts) - upload 201, the three content objects and the library objects present in the bucket, player model, whole media download byte-identical at both ends, ranges at the start, in the middle and open-ended matching the original bytes with correct Content-Range, bad play token 403, delete leaving 0 objects under the content prefix. Real bucket: 99 MB upload took 11.3 s, download 3.7 s. An object written by the run was read back with `wrangler r2 object get --remote`.
- Container path under local Docker (smoke stub): put with a non-ASCII key, range 206, a 16 MB multipart upload read back across the part boundary, list, delete - all through the intercepted bridge host.
- Bucket privacy: r2.dev access disabled and no custom domain (Cloudflare API); the public r2.dev URL of a test object answered 401.
- Test objects removed from the real bucket (0 objects left). Repo-wide lint, typecheck, test and build pass.
Not verified: the real API image using R2 from inside a deployed container (TASK-52); files larger than the 100 MB package limit.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T22:49:35Z

---

From TASK-43: the supabase-js bucket bootstrap is already removed from StorageService and STORAGE_S3_ENDPOINT is required (no default derived from SUPABASE_URL). Local development currently points it at the local Supabase S3 endpoint.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
H5P files now live in Cloudflare R2, reached through the gateway bridge like the database: no access keys exist, production and local development share one code path, and local development needs neither Docker nor internet. StorageService kept its interface; uploads are cut into 8 MiB parts so nothing large is held in memory or sent in one request. The S3 SDK and its settings are gone. Verified with unit tests on both sides and live runs against the local and the real bucket (1 MB and 99 MB packages, ranges, delete), plus R2 from inside a container locally.
<!-- SECTION:FINAL_SUMMARY:END -->
