import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * Discount coupons: a code that takes a percentage off a course's price
 * between two dates. Days are UTC and both ends are included, so a coupon
 * from 2026-03-01 to 2026-03-31 works for the whole of March.
 */

/** Letters, digits, `-` and `_`; stored and compared upper-case. */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,40}$/, 'Use 3 to 40 letters, digits, "-" or "_".');

const dateSchema = z.iso.date('Use a date such as 2026-03-31.');

export const couponInputSchema = z
  .object({
    code: couponCodeSchema,
    percentOff: z
      .number()
      .int('Use a whole number.')
      .min(1, 'At least 1%.')
      .max(100, 'At most 100%.'),
    startsOn: dateSchema,
    endsOn: dateSchema,
  })
  .refine((coupon) => coupon.endsOn >= coupon.startsOn, {
    message: 'The end date cannot be before the start date.',
    path: ['endsOn'],
  });
export type CouponInput = z.infer<typeof couponInputSchema>;

export interface Coupon {
  id: string;
  code: string;
  percentOff: number;
  startsOn: string;
  endsOn: string;
  /** True when today (UTC) is between the two dates. */
  active: boolean;
  /** Paid orders that used it. */
  timesUsed: number;
  createdAt: string;
}

/** Whether a coupon running from `startsOn` to `endsOn` can be used on `today` (all `YYYY-MM-DD`). */
export function couponIsActive(
  coupon: { startsOn: string; endsOn: string },
  today: string,
): boolean {
  return coupon.startsOn <= today && today <= coupon.endsOn;
}

/** The price after the discount, in minor units, rounded to the nearest one. */
export function discountedPrice(priceCents: number, percentOff: number): number {
  return Math.round((priceCents * (100 - percentOff)) / 100);
}

export const checkoutQuoteSchema = z.object({
  courseId: idSchema,
  couponCode: couponCodeSchema,
});
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;

/** What a course costs with a coupon, shown in the buy box before paying. */
export interface CheckoutQuote {
  couponCode: string;
  percentOff: number;
  priceCents: number;
  discountedCents: number;
  currency: string;
}
