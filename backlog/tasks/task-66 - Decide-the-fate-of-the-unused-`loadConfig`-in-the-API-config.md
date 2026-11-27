---
id: TASK-66
title: Decide the fate of the unused `loadConfig()` in the API config
status: Done
assignee:
  - '@claude'
created_date: '2026-11-27T18:52:11Z'
updated_date: '2026-11-27T19:09:09Z'
labels:
  - api
  - payments
  - config
milestone: m-2
dependencies: []
type: chore
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/api/src/config/configuration.ts exports `loadConfig()`, which validates the environment like `envSchema` and additionally refuses to start in production when `STRIPE_SECRET_KEY` is missing. Nothing calls it: AppModule validates with `envSchema.parse` in `ConfigModule.forRoot({ validate })`, so the production rule never runs and the dead function suggests a guarantee that does not exist. Raised in TASK-52 and left open in TASK-24. Today a production deploy without the key still boots and PaymentsService answers 503 to paid checkouts while free courses keep working; making the key mandatory at boot would instead stop the whole API, site included, until it is set. Decide which behaviour production should have, then make the code say exactly that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 There is a single environment-validation path, used by AppModule; no exported validation function is left unused
- [x] #2 The chosen production behaviour without STRIPE_SECRET_KEY (refuse to boot, or boot and refuse paid checkouts) is covered by a unit test
- [x] #3 Validation errors still list every invalid variable with its path
- [x] #4 docs/deployment.md states what happens when STRIPE_SECRET_KEY is missing in production
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision: production boots without STRIPE_SECRET_KEY and refuses paid checkouts (503); free courses keep working. Refusing to boot would take the live site down, since production runs without the key until payments go live.
1. Replace the unused loadConfig() with validateEnv(), the only validation function, used by AppModule; it lists every invalid variable with its path and has no Stripe rule.
2. Unit tests: validateEnv error lists every invalid variable; production without the key validates; PaymentsService in production without a key answers 503 to a paid course and enrolls in a free one.
3. docs/deployment.md (and architecture.md) state that the API boots and paid checkouts answer 503 without the key.
4. lint, typecheck, tests, format.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced loadConfig() with validateEnv() (configuration.ts), used by AppModule; no Stripe rule at boot. Tests: configuration.spec.ts (every invalid variable listed with its path; production validates without the key) and payments.service.spec.ts (production without key: paid course 503 with no order or enrollment, free course enrolls). docs/deployment.md and docs/architecture.md updated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decision: production boots without STRIPE_SECRET_KEY and refuses paid checkouts (503) while free courses keep working; requiring the key at boot would take the live site down until payments go live. The unused loadConfig() (whose production Stripe rule never ran) is replaced by validateEnv() in apps/api/src/config/configuration.ts, now the only validation path, used by AppModule; it still lists every invalid variable with its path. New tests: configuration.spec.ts (all invalid variables listed; production validates without the key) and payments.service.spec.ts (production without key: paid course 503 with no order or enrollment, free course enrolls). docs/deployment.md and docs/architecture.md state the behaviour. lint, typecheck, test (800) and format:check pass. Follow-up for when payments go live: set both Stripe secrets with wrangler.
<!-- SECTION:FINAL_SUMMARY:END -->
