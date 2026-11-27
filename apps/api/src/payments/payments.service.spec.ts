import type { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import { createTestDatabase } from '../infra/db/sqlite.test-driver.js';
import { PaymentsService } from './payments.service.js';
import { CouponsService } from '../coupons/coupons.service.js';

describe('PaymentsService checkout', () => {
  it('describes the course to Stripe with the plain text of its summary', async () => {
    const t = createTestDatabase();
    t.addUser('u1');
    t.all(
      `insert into courses (id, title, slug, summary, price_cents, currency, status)
       values ('c1', 'Ukrainian A1', 'a1', ?, 2500, 'eur', 'published')`,
      '<h2>Start</h2><p>Tom &amp; <strong>Jerry</strong> 👋</p><img src="https://a/b.png" />',
    );
    const config = {
      get: (key: string) =>
        ({ STRIPE_SECRET_KEY: 'sk_test_x', STUDENT_APP_URL: 'https://student.example.com' })[key],
    } as unknown as ConfigService<Env, true>;
    const service = new PaymentsService(
      t.db,
      config,
      new CouponsService(t.db, { now: () => Date.now() }),
    );

    const sessions: Stripe.Checkout.SessionCreateParams[] = [];
    // The real client is replaced: no request leaves the test.
    (service as unknown as { stripe: unknown }).stripe = {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams) => {
            sessions.push(params);
            return { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' };
          },
        },
      },
    };

    await service.checkout({ uid: 'u1', email: undefined, role: 'student' }, 'c1');
    expect(sessions[0]?.line_items?.[0]?.price_data?.product_data).toEqual({
      name: 'Ukrainian A1',
      description: 'Start Tom & Jerry 👋',
    });
  });

  describe('in production without a Stripe key', () => {
    const setup = () => {
      const t = createTestDatabase();
      t.addUser('u1');
      t.all(
        `insert into courses (id, title, slug, summary, price_cents, currency, status)
         values ('paid', 'Paid', 'paid', '', 2500, 'eur', 'published'),
                ('free', 'Free', 'free', '', 0, 'eur', 'published')`,
      );
      const config = {
        get: (key: string) =>
          ({ NODE_ENV: 'production', STUDENT_APP_URL: 'https://student.example.com' })[key],
      } as unknown as ConfigService<Env, true>;
      return {
        t,
        service: new PaymentsService(
          t.db,
          config,
          new CouponsService(t.db, { now: () => Date.now() }),
        ),
      };
    };
    const student = { uid: 'u1', email: undefined, role: 'student' as const };

    it('refuses a paid course with 503 and enrolls nobody', async () => {
      const { t, service } = setup();
      await expect(service.checkout(student, 'paid')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(t.all('select * from enrollments')).toEqual([]);
      expect(t.all('select * from orders')).toEqual([]);
    });

    it('still enrolls the student in a free course', async () => {
      const { t, service } = setup();
      await expect(service.checkout(student, 'free')).resolves.toEqual({
        url: 'https://student.example.com/my-courses/free',
        enrolled: true,
      });
      expect(t.all('select course_id from enrollments')).toEqual([{ course_id: 'free' }]);
    });
  });

  describe('with a coupon', () => {
    const student = { uid: 'u1', email: undefined, role: 'student' as const };
    const setup = (env: Record<string, string>) => {
      const t = createTestDatabase();
      t.addUser('u1');
      t.all(
        `insert into courses (id, title, slug, summary, price_cents, currency, status)
         values ('paid', 'Ukrainian A1', 'paid', '', 2500, 'eur', 'published'),
                ('free', 'Free', 'free', '', 0, 'eur', 'published')`,
      );
      t.all(
        `insert into coupons (code, percent_off, starts_on, ends_on)
         values ('SPRING', 20, '2026-03-01', '2026-03-31'),
                ('GIFT', 100, '2026-03-01', '2026-03-31'),
                ('OLD', 50, '2026-01-01', '2026-01-31')`,
      );
      const config = {
        get: (key: string) => ({ STUDENT_APP_URL: 'https://student.example.com', ...env })[key],
      } as unknown as ConfigService<Env, true>;
      const coupons = new CouponsService(t.db, { now: () => Date.parse('2026-03-15T12:00:00Z') });
      const service = new PaymentsService(t.db, config, coupons);
      const sessions: Stripe.Checkout.SessionCreateParams[] = [];
      (service as unknown as { stripe: unknown }).stripe = env['STRIPE_SECRET_KEY']
        ? {
            checkout: {
              sessions: {
                create: async (params: Stripe.Checkout.SessionCreateParams) => {
                  sessions.push(params);
                  return { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' };
                },
              },
            },
          }
        : null;
      return { t, service, sessions };
    };

    it('charges the discounted price and records the coupon on the order', async () => {
      const { t, service, sessions } = setup({ STRIPE_SECRET_KEY: 'sk_test_x' });
      await service.checkout(student, 'paid', 'spring');
      expect(sessions[0]?.line_items?.[0]?.price_data).toMatchObject({
        unit_amount: 2000,
        product_data: { name: 'Ukrainian A1 (20% off with SPRING)' },
      });
      expect(
        t.all('select amount_cents, provider, coupon_code, discount_percent, status from orders'),
      ).toEqual([
        {
          amount_cents: 2000,
          provider: 'stripe',
          coupon_code: 'SPRING',
          discount_percent: 20,
          status: 'pending',
        },
      ]);
    });

    it('enrolls at once with a 100% coupon, without Stripe, even in production', async () => {
      const { t, service } = setup({ NODE_ENV: 'production' });
      await expect(service.checkout(student, 'paid', 'GIFT')).resolves.toEqual({
        url: 'https://student.example.com/my-courses/paid',
        enrolled: true,
      });
      expect(t.all('select amount_cents, provider, coupon_code, status from orders')).toEqual([
        { amount_cents: 0, provider: 'coupon', coupon_code: 'GIFT', status: 'paid' },
      ]);
      expect(t.all('select course_id from enrollments')).toEqual([{ course_id: 'paid' }]);
    });

    it('refuses an expired or unknown coupon and creates no order', async () => {
      const { t, service } = setup({ STRIPE_SECRET_KEY: 'sk_test_x' });
      await expect(service.checkout(student, 'paid', 'OLD')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.checkout(student, 'paid', 'NOPE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(t.all('select * from orders')).toEqual([]);
    });

    it('ignores a coupon on a free course', async () => {
      const { t, service } = setup({});
      await service.checkout(student, 'free', 'NOPE');
      expect(t.all('select amount_cents, provider, coupon_code from orders')).toEqual([
        { amount_cents: 0, provider: 'free', coupon_code: null },
      ]);
    });

    it('quotes the discounted price without buying anything', async () => {
      const { t, service } = setup({ STRIPE_SECRET_KEY: 'sk_test_x' });
      await expect(service.quote('paid', 'SPRING')).resolves.toEqual({
        couponCode: 'SPRING',
        percentOff: 20,
        priceCents: 2500,
        discountedCents: 2000,
        currency: 'eur',
      });
      await expect(service.quote('free', 'SPRING')).rejects.toThrow('free');
      expect(t.all('select * from orders')).toEqual([]);
    });
  });
});
