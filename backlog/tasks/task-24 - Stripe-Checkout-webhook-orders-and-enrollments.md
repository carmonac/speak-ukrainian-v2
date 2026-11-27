---
id: TASK-24
title: Stripe Checkout, webhook, orders and enrollments
status: Done
assignee: []
created_date: '2026-11-24T15:06:43Z'
updated_date: '2026-11-27T18:52:11Z'
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
- [x] #1 Paying with a test card enrolls the student
- [x] #2 Replayed webhooks do not duplicate orders
- [x] #3 An already-owned course cannot be bought again
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Stripe Checkout + webhook + orders/enrollments. Verified: purchase in dev payment mode enrolls the student; a correctly signed checkout.session.completed webhook enrolls, a replay does not duplicate, a bad signature is refused (400); buying an owned course answers 409. NOT verified: a real Stripe test-mode payment with a test card — needs STRIPE_SECRET_KEY and stripe listen.

2026-11-27: Verified a real Stripe sandbox payment end to end. Sandbox 'Entorno de prueba de SpeakUkrainian' keys in .env; stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to localhost:8787/api/payments/stripe/webhook (CLI 1.55 requires --events). A 19 EUR test course paid with 4242 4242 4242 4242: the order became paid (provider stripe, session id stored) and the enrollment was created 4 ms later; /api/me/courses lists the course for the student. The success redirect landed on the student login page only because the test student was signed in through the API, not in that browser.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-24T23:57:07Z

---

From TASK-52: PaymentsService now refuses a paid checkout (503) in production when STRIPE_SECRET_KEY is missing, instead of enrolling for free. loadConfig() in config/configuration.ts, which was meant to require the key in production, is not used by the app (AppModule validates with envSchema.parse); decide here whether to wire it in.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Students buy paid courses through Stripe Checkout. PaymentsService creates a pending order and a Checkout session (payment mode, order id as client_reference_id and metadata). The signed webhook (checkout.session.completed / async_payment_succeeded) marks the order paid and creates the enrollment in one D1 batch, idempotently; expired or failed sessions cancel the pending order. Free courses, and paid ones in local dev without a key, enroll at once; production refuses paid checkouts (503) without STRIPE_SECRET_KEY. Verified: unit tests; replayed webhooks do not duplicate; owned courses answer 409; a bad signature answers 400; and on 2026-11-27 a real sandbox payment with the 4242 test card through stripe listen enrolled the student. Follow-ups not in scope: unused loadConfig() (own task), Stripe Tax, invoices, and refund/dispute handling.
<!-- SECTION:FINAL_SUMMARY:END -->
