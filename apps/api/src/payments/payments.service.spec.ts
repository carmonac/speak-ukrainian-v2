import type { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import { createTestDatabase } from '../infra/db/sqlite.test-driver.js';
import { PaymentsService } from './payments.service.js';

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
    const service = new PaymentsService(t.db, config);

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
});
