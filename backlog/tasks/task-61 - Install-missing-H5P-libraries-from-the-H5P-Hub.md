---
id: TASK-61
title: Install missing H5P libraries from the H5P Hub
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-27T10:57:06Z'
updated_date: '2026-11-27T11:02:58Z'
labels:
  - h5p
  - api
dependencies: []
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packages exported without libraries (e.g. from Moodle or h5p.com, like berries-95-1349799.h5p which only has h5p.json and content/ for H5P.InfoWall 0.4) are refused with 'install-missing-libraries', and the editor's content-type selector shows 'No content types are available' because the H5P content-type Hub is switched off. Authors should not need to know about libraries: behave like Moodle and fetch missing content types from the H5P Hub (api.h5p.org). The Content Hub (sharing content) stays off.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uploading a .h5p package that lacks its libraries installs the missing content types from the H5P Hub and imports the exercise
- [ ] #2 The editor's Upload tab accepts the same kind of package
- [ ] #3 The editor's content-type selector lists H5P Hub content types and can install one
- [ ] #4 When the Hub cannot provide a library the error names the missing libraries
- [ ] #5 docs/h5p.md describes the new behaviour
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Stop seeding an empty content-type cache; let ContentTypeCache fetch from the Hub (registration + content-types).
2. Allow the library-install ajax action.
3. On install-missing-libraries during package import (course upload and editor library-upload), install each missing machine name from the Hub and retry once.
4. Include missing library names in the error message.
5. Tests, docs, verify locally against the real Hub.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: h5p.hub.ts (withLibrariesFromHub + local id override), unseeded content-type cache in h5p.module.ts, library-install allowed with ?id, missing libraries named in the error, docs/h5p.md updated. Unit tests added; lint/typecheck/format/api tests pass.
Verified locally against the real Hub: berries-95-1349799.h5p (H5P.InfoWall 0.4, no libraries) imported via POST /api/h5p/content in 7.8 s, log "Installed H5P.InfoWall from the H5P Hub"; player model loads H5P.InfoWall-0.4. Selector lists Hub types and True/False Question installed via Get → Install.
Not verified in a browser: the editor Upload tab with a library-less package (same helper, unit-tested). Not deployed.
<!-- SECTION:NOTES:END -->
