---
id: TASK-57
title: Cache public pages in the API instead of reading D1 on every visit
status: Done
assignee:
  - '@claude'
created_date: '2026-11-25T08:25:49Z'
updated_date: '2026-11-25T09:10:17Z'
labels:
  - api
  - performance
dependencies: []
references:
  - apps/api/src/site/site.service.ts
  - apps/api/src/site/site.renderer.ts
  - apps/api/src/pages/pages.service.ts
  - apps/api/src/pages/pages.controller.ts
documentation:
  - docs/pages.md
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every GET to the public site (www.speakukrainian.org) runs two D1 queries through the gateway: `PagesService.findByPath()` reads the page row and then its texts and translations. `SiteRenderer` only caches the compiled Handlebars template (keyed by the template source), so the database is still hit on every request, and the HTML is served with `Cache-Control: no-cache`, so neither the browser nor Cloudflare avoids it. Page content changes only when an admin saves or deletes a page in the panel, so these reads are almost always redundant and add latency and D1 usage to every visit. The renderer is already invalidated in `PagesController` on create, update and delete; a page cache can hook into the same points. Today the API runs as a single Container instance (one Durable Object); if that changes, in-process invalidation only reaches the instance that handled the edit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Repeated visits to the same page (including the main page at /) are served without querying D1 for the page or its texts
- [x] #2 Unknown paths (404) are also cached briefly or bounded, so random URLs cannot grow memory without limit or hammer D1
- [x] #3 Creating, editing or deleting a page in the admin panel is visible on the next public load, including changes to the main page flag and path renames
- [x] #4 Cached entries also expire after a short TTL, so a stale entry cannot outlive an edit made through another API instance
- [x] #5 The admin panel and the pages API keep reading fresh data from D1
- [x] #6 Unit tests cover cache hit, invalidation on save/delete, and TTL expiry
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New PageCache (apps/api/src/site/page-cache.ts), used only by SiteService: path -> page with its texts, or "no such page". Admin routes keep calling PagesService and read D1 every time.
2. Freshness: entries expire after a short TTL (60 s for pages, 30 s for unknown paths), read from the injected CLOCK so tests do not sleep. PagesController clears the whole cache next to the existing renderer.invalidate() on create, update and delete; clearing everything is what makes main-flag changes and path renames correct without reasoning about which keys an edit touches.
3. Bounds: at most 500 entries, oldest dropped first, so made-up URLs cannot grow memory; while an unknown path is cached it costs no query.
4. Concurrent first visits to the same path share one load. A load that started before an invalidation is returned to its caller but not stored.
5. HTTP Cache-Control stays no-cache: the criteria are about D1 reads, and letting browsers or the CDN keep pages would bring back the staleness the invalidation removes.
6. Tests: unit tests for PageCache (hit, miss, negative entries, bound, clear, TTL, shared load, load racing an invalidation) and tests with the real PagesService on SQLite counting statements across visits and edits. Then a local run counting bridge requests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25: implemented.
- apps/api/src/site/page-cache.ts: PageCache, used only by SiteService. Pages live 60 s, unknown paths 30 s, at most 500 paths (oldest dropped first), time read from the injected CLOCK. Simultaneous first visits share one lookup; a lookup that an invalidation overtook is returned to its caller but not stored; a failed lookup is not remembered.
- PagesController.publish() clears the cache together with the compiled templates after create, update and delete. PagesService is unchanged, so the admin routes read D1 every time.
- Cache-Control on public pages stays no-cache (comment in site.service.ts says why).
- docs/architecture.md and docs/pages.md describe it.

Verification:
- 15 new tests: 9 on PageCache with a fake clock and a fake lookup (hit, unknown path, expiry at exactly the TTL, shorter TTL for unknown paths, clear, the 500-entry bound with 750 made-up paths, shared lookup, lookup racing an invalidation, failed lookup) and 6 with the real PagesService and PagesController on SQLite counting SQL statements: the main page costs 2 statements on the first visit and none for the next 20; an unknown path costs 1 and then none until it expires; a created, edited and deleted page, a path rename and a change of main page are each visible on the very next read; the panel routes keep issuing statements and see a direct database change at once while the site keeps its copy until expiry.
- Live, API against wrangler dev and local D1, with markers in the gateway log: 0 bridge queries during 25 consecutive visits to /, 1 query for 10 visits to an unknown path; editing a text of the main page through the admin API showed on the next public load; a created page answered 200 and after deletion 404 on the next request; the main page was restored afterwards.
- Repo-wide lint, typecheck, test (690 API tests), build and format:check pass.
Not done: not deployed to production yet (needs `pnpm deploy:prod gateway`). Out of scope and unchanged: each visit by a browser still makes one D1 write to count the visitor (insert into page_views, not awaited); it could be skipped for visitors already counted today.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The public site now serves pages from an in-process cache instead of reading D1 on every visit. Entries expire after a minute (30 s for unknown paths), the cache holds at most 500 paths, and the pages controller clears it on every create, update and delete, so edits, renames and main-page changes show on the next load. The control panel still reads the database directly. Covered by 15 tests and a local run counting bridge queries. Not yet deployed. One D1 write per browser visit remains for visitor counting; reducing it would be separate work.
<!-- SECTION:FINAL_SUMMARY:END -->
