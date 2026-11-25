---
id: TASK-60
title: Open the page preview in a new tab
status: Done
assignee:
  - '@claude'
created_date: '2026-11-25T09:39:29Z'
updated_date: '2026-11-25T09:57:03Z'
labels:
  - admin
  - site
milestone: m-6
dependencies: []
references:
  - apps/admin/src/app/features/pages/page-editor.ts
  - apps/api/src/pages/pages.controller.ts
documentation:
  - docs/pages.md
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The page editor already has a preview (TASK-33): it renders the unsaved content through `POST /api/pages/preview` and shows it in a sandboxed iframe inside the panel. That view is cramped and does not show the page as visitors see it at full width. Administrators want a Preview button that opens the rendered, unsaved content in its own tab, with a small banner on top so it is never mistaken for the live page. The preview HTML is written by administrators and may contain scripts; it must not run with access to the admin panel (same origin, session, local storage), the same reason the current iframe is sandboxed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The create and edit page screens have a Preview button
- [x] #2 Clicking it renders the current, unsaved template and texts and opens the result in a new browser tab
- [x] #3 The previewed page shows a small bar at the top with the text: This is a preview, if you want to keep it, save it in the editor.
- [x] #4 The bar does not change the layout of the page content beneath it and is not added to the saved page or the public site
- [x] #5 Nothing is saved when previewing; closing the tab leaves the editor and the stored page unchanged
- [x] #6 Scripts in the previewed page cannot read or act on the admin panel origin or its session
- [x] #7 The preview uses the language currently selected in the editor, as the existing preview does
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The preview must not run in the admin origin. A blob: or data: page opened from the panel would inherit or be blocked, so the HTML is served by the API on the public-site origin instead: POST /api/admin/pages/preview-link (admin) renders the unsaved template and texts, keeps the HTML in memory under an unguessable token for a few minutes, and returns a URL; GET /api/preview/<token> (public) returns it.
2. That response carries Content-Security-Policy: sandbox (scripts allowed, same-origin not), so the page runs with an opaque origin: no cookies, no storage, no access to the site or panel origins. It is also no-store and noindex.
3. The banner with the required text is injected only into that response: fixed at the top, above the page, so the layout beneath is unchanged. Nothing is written to the database.
4. Page editor: the Preview button opens a tab first (inside the click, so the browser does not block it), then points it at the URL. The language selector moves next to the button; the in-panel modal with the iframe goes away.
5. Limits: previews live in the memory of the single API container; a restart or the expiry (15 minutes) ends them, and the tab then says so.
6. Tests: banner injection, the store (expiry, bound), the two routes (authorization, CSP sandbox header, banner present, nothing saved, language).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. API: POST /api/admin/pages/preview-link renders the unsaved form in the chosen language, adds the banner and keeps the HTML in memory under a random token (15 min, 50 at most); GET /api/preview/:token (public, on the site origin) serves it with 'Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-modals' (no allow-same-origin), no-store and noindex. The old POST /api/admin/pages/preview and the modal with the iframe are removed. Admin: language select next to the Preview button; the click opens the tab synchronously, clears its opener and sends it to the link. Verified locally: a probe page run in headless Chrome and in the browser pane reports origin 'null', localStorage and cookies blocked, opener null, the admin API unreachable, the banner fixed with the page's first element still at y=0, and an uploaded image loading. The browser pane used for testing blocks pop-ups from automated clicks, so the tab opening itself was checked by capturing window.open (URL received, opener cleared); a real click in a regular browser was not exercised. pnpm lint, typecheck, test (730 API tests), build and format:check pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preview on the create/edit screens now opens the unsaved page in a new tab, in the language selected next to the button, with a bar on top reading 'This is a preview, if you want to keep it, save it in the editor.'. The bar is fixed over the page (the layout beneath is unchanged) and is only added to previews. Nothing is written to the database. The tab loads from the public site origin under a CSP sandbox without allow-same-origin, so the page's scripts run but cannot reach the panel, its session or its storage. Covered by apps/api/src/site/preview.spec.ts. Not deployed to production yet.
<!-- SECTION:FINAL_SUMMARY:END -->
