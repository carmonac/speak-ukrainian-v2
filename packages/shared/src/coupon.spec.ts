import { describe, expect, it } from 'vitest';
import { couponInputSchema, couponIsActive, discountedPrice } from './coupon.js';

describe('couponInputSchema', () => {
  const valid = {
    code: ' spring-26 ',
    percentOff: 20,
    startsOn: '2026-03-01',
    endsOn: '2026-03-31',
  };

  it('trims the code and makes it upper-case', () => {
    expect(couponInputSchema.parse(valid).code).toBe('SPRING-26');
  });

  it('refuses codes with spaces or other symbols, and too short ones', () => {
    for (const code of ['NO SPACE', 'AB', 'ÄPFEL', 'HALF%']) {
      expect(couponInputSchema.safeParse({ ...valid, code }).success).toBe(false);
    }
  });

  it('takes whole percentages from 1 to 100', () => {
    for (const percentOff of [0, 101, 12.5]) {
      expect(couponInputSchema.safeParse({ ...valid, percentOff }).success).toBe(false);
    }
    expect(couponInputSchema.safeParse({ ...valid, percentOff: 100 }).success).toBe(true);
  });

  it('refuses an end date before the start date, on the end date', () => {
    const result = couponInputSchema.safeParse({ ...valid, endsOn: '2026-02-28' });
    expect(result.error?.issues[0]?.path).toEqual(['endsOn']);
    expect(couponInputSchema.safeParse({ ...valid, endsOn: valid.startsOn }).success).toBe(true);
  });
});

describe('couponIsActive', () => {
  const coupon = { startsOn: '2026-03-01', endsOn: '2026-03-31' };

  it('includes both ends', () => {
    expect(couponIsActive(coupon, '2026-02-28')).toBe(false);
    expect(couponIsActive(coupon, '2026-03-01')).toBe(true);
    expect(couponIsActive(coupon, '2026-03-31')).toBe(true);
    expect(couponIsActive(coupon, '2026-04-01')).toBe(false);
  });
});

describe('discountedPrice', () => {
  it('takes the percentage off and rounds to a cent', () => {
    expect(discountedPrice(2500, 20)).toBe(2000);
    expect(discountedPrice(999, 15)).toBe(849);
    expect(discountedPrice(2500, 100)).toBe(0);
  });
});
