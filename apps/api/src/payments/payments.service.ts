import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { CheckoutResult } from '@speakukrainian/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { Env } from '../config/configuration.js';
import { DatabaseService } from '../infra/db/database.service.js';

interface CourseForSale {
  id: string;
  title: string;
  slug: string;
  summary: string;
  price_cents: number;
  currency: string;
}

/**
 * Selling courses with Stripe Checkout.
 *
 * The browser is only ever redirected: the enrollment is created by the
 * signed webhook, never by the student returning to the success page.
 *
 * Without a Stripe key (never in production) a purchase completes instantly,
 * so the whole classroom can be exercised locally.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly studentUrl: string;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService<Env, true>,
  ) {
    const key = config.get('STRIPE_SECRET_KEY', { infer: true });
    this.stripe = key ? new Stripe(key) : null;
    this.webhookSecret = config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
    this.studentUrl = config.get('STUDENT_APP_URL', { infer: true }).replace(/\/$/, '');
    if (!this.stripe) {
      this.logger.warn('STRIPE_SECRET_KEY is not set: purchases complete instantly (dev mode).');
    }
  }

  async checkout(user: AuthenticatedUser, courseId: string): Promise<CheckoutResult> {
    const course = await this.db.one<CourseForSale>(
      `select id, title, slug, summary, price_cents, currency
       from public.courses where id = $1 and status = 'published'`,
      [courseId],
    );
    if (!course) {
      throw new NotFoundException('That course is not available.');
    }

    const owned = await this.db.one(
      'select 1 from public.enrollments where user_id = $1 and course_id = $2',
      [user.uid, courseId],
    );
    if (owned) {
      throw new ConflictException('You already own this course.');
    }

    const courseUrl = `${this.studentUrl}/my-courses/${course.id}`;

    if (course.price_cents === 0 || !this.stripe) {
      const order = await this.createOrder(
        user.uid,
        course,
        course.price_cents === 0 ? 'free' : 'dev',
      );
      await this.fulfil(order);
      return { url: courseUrl, enrolled: true };
    }

    const orderId = await this.createOrder(user.uid, course, 'stripe');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: orderId,
      ...(user.email ? { customer_email: user.email } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: course.currency,
            unit_amount: course.price_cents,
            product_data: {
              name: course.title,
              ...(course.summary ? { description: course.summary } : {}),
            },
          },
        },
      ],
      metadata: { orderId, userId: user.uid, courseId: course.id },
      success_url: `${courseUrl}?checkout=success`,
      cancel_url: `${this.studentUrl}/courses/${course.slug}?checkout=cancelled`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException('The payment page could not be created.');
    }
    await this.db.query('update public.orders set stripe_session_id = $2 where id = $1', [
      orderId,
      session.id,
    ]);
    return { url: session.url, enrolled: false };
  }

  /** Verifies and applies one Stripe webhook delivery. Safe to receive twice. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!this.stripe || !this.webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhooks are not configured.');
    }
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature.');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        // A delayed payment method completes the session before the money arrives.
        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
          await this.fulfilSession(session);
        }
        break;
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        await this.db.query(
          `update public.orders set status = 'cancelled'
           where stripe_session_id = $1 and status = 'pending'`,
          [event.data.object.id],
        );
        break;
      }
      default:
        break;
    }
  }

  private async fulfilSession(session: Stripe.Checkout.Session): Promise<void> {
    const order = await this.db.one<{ id: string }>(
      'select id from public.orders where stripe_session_id = $1 or id::text = $2 limit 1',
      [session.id, session.client_reference_id ?? ''],
    );
    if (!order) {
      this.logger.error(`Stripe session ${session.id} was paid but matches no order.`);
      return;
    }
    await this.fulfil(order.id);
  }

  private async createOrder(
    userId: string,
    course: CourseForSale,
    provider: string,
  ): Promise<string> {
    const row = await this.db.one<{ id: string }>(
      `insert into public.orders (user_id, course_id, amount_cents, currency, provider)
       values ($1, $2, $3, $4, $5) returning id`,
      [userId, course.id, course.price_cents, course.currency, provider],
    );
    return row!.id;
  }

  /** Marks the order paid and enrolls the student, exactly once. */
  private async fulfil(orderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const paid = await tx.query<{ user_id: string; course_id: string }>(
        `update public.orders set status = 'paid', paid_at = now()
         where id = $1 and status <> 'paid'
         returning user_id, course_id`,
        [orderId],
      );
      const order = paid.rows[0];
      if (!order) {
        return; // Already fulfilled by an earlier delivery.
      }
      await tx.query(
        `insert into public.enrollments (user_id, course_id, order_id) values ($1, $2, $3)
         on conflict (user_id, course_id) do nothing`,
        [order.user_id, order.course_id, orderId],
      );
    });
  }
}
