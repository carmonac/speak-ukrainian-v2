---
id: TASK-24
title: Stripe Checkout, webhook, orders and enrollments
status: In Progress
assignee: []
created_date: '2026-11-24T15:06:43Z'
updated_date: '2026-11-24T23:57:07Z'
labels:
  - student
  - api
  - payments
milestone: m-2
dependencies:
  - TASK-22
  - TASK-23
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create Checkout sessions, verify the webhook signature, mark orders paid idempotently and enroll the student.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Paying with a test card enrolls the student
- [x] #2 Replayed webhooks do not duplicate orders
- [x] #3 An already-owned course cannot be bought again
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Stripe Checkout + webhook + orders/enrollments. Verified: purchase in dev payment mode enrolls the student; a correctly signed checkout.session.completed webhook enrolls, a replay does not duplicate, a bad signature is refused (400); buying an owned course answers 409. NOT verified: a real Stripe test-mode payment with a test card — needs STRIPE_SECRET_KEY and stripe listen.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T23:57:07Z

---

From TASK-52: PaymentsService now refuses a paid checkout (503) in production when STRIPE_SECRET_KEY is missing, instead of enrolling for free. loadConfig() in config/configuration.ts, which was meant to require the key in production, is not used by the app (AppModule validates with envSchema.parse); decide here whether to wire it in.

---
<!-- COMMENTS:END -->
