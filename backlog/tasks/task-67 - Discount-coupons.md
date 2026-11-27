---
id: TASK-67
title: Discount coupons
status: Done
assignee:
  - '@claude'
created_date: '2026-11-27T20:45:08Z'
updated_date: '2026-11-27T20:55:01Z'
labels:
  - payments
  - admin
  - student
  - api
dependencies: []
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The administrator wants to run promotions (launch offers, discounts for a group of students, seasonal sales) without changing course prices. Today the price a student pays is always the course's price_cents, sent to Stripe Checkout as is. A coupon is a code the administrator creates in the control panel with a percentage discount and a date range when it can be used; the student types it while buying a course and pays the reduced price.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The control panel menu has a Coupons section listing all coupons with their code, discount, active date range and whether they are currently active
- [x] #2 The administrator can create a coupon with a code, a whole-number percentage discount (1-100) and a start and end date; the code is unique (case-insensitive) and the end date cannot be before the start date
- [x] #3 The administrator can edit and delete a coupon, with a confirmation before deleting
- [x] #4 During checkout the student can enter a coupon code and sees the discounted price before paying, or a clear message when the code does not exist or is outside its date range
- [x] #5 The price charged by Stripe is computed by the API from the course price and a coupon it validates itself; the browser never sends the amount
- [x] #6 A coupon that brings the price to zero (100%) enrolls the student without going through Stripe, the same way a free course does
- [x] #7 The order records which coupon was used and the amount paid, so past purchases stay correct after a coupon is edited or deleted
- [x] #8 Coupon routes are admin-only, except validating a code during checkout
- [x] #9 Schema changes are a new migration in apps/gateway/migrations/; tests cover validation, date ranges, the discounted amount and the 100% case; docs are updated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration 0006: coupons table (code unique case-insensitive, percent_off 1-100, starts_on/ends_on as YYYY-MM-DD, inclusive, UTC days); orders gain coupon_code and discount_percent snapshots (no FK, so deleting a coupon keeps history).
2. Shared: coupon.ts with couponInputSchema (code normalised to upper case, 3-40 chars A-Z 0-9 _ -), Coupon type (with active flag and paid-use count), CheckoutQuote; checkoutSchema gains optional couponCode.
3. API: CouponsModule (admin CRUD under /api/admin/coupons, 409 on duplicate code) and CouponsService.redeemable(code) using the injected CLOCK. PaymentsService prices the order from course price and coupon (rounded to cents); 0 enrolls without Stripe (provider 'coupon'). POST /api/me/checkout/quote returns the discounted price for the buy box.
4. Admin: Coupons menu entry, list page with create/edit modal and delete confirmation.
5. Student: coupon field in the buy box for paid courses, shows the discounted price and sends the code with the checkout.
6. Tests (service, controller, migration), browser check in admin and student, docs (architecture, pages/deployment as relevant).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dates use native date inputs: ng-zorro 22's range picker needs a separate date adapter provider. A malformed code is answered in the browser with 'does not exist' instead of the API's validation message. Coupons have no usage limit and no per-course restriction (not requested). Stripe's per-currency minimum charge is not checked: a coupon leaving a few cents would be refused by Stripe.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Discount coupons. Migration 0006 adds coupons (unique case-insensitive code, 1-100%, first and last UTC day, inclusive) and coupon_code/discount_percent on orders. API: CouponsModule with admin CRUD under /api/admin/coupons (409 on a duplicate code); POST /api/me/checkout/quote shows the discounted price; /api/me/checkout accepts couponCode, re-checks it and prices the order itself (Stripe gets the discounted unit_amount; a 100% coupon enrolls at once as provider 'coupon'). Control panel: Coupons menu entry with list (status, uses), create/edit dialog and delete confirmation. Classroom: 'Have a coupon code?' in the buy box, struck-through price and the discount. Verified: shared 38, API 812 and gateway 65 tests; lint, typecheck, format and build; in the browser created, edited, rejected a duplicate, deleted, applied invalid/valid codes and enrolled with a 100% coupon. Not deployed: needs migration 0006 (full deploy).
<!-- SECTION:FINAL_SUMMARY:END -->
