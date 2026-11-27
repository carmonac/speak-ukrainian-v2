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
import { discountedPrice, type CheckoutQuote, type CheckoutResult } from '@speakukrainian/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { Env } from '../config/configuration.js';
import { CouponsService, type RedeemableCoupon } from '../coupons/coupons.service.js';
import { richTextToPlain } from '../courses/rich-text.js';
import { DatabaseService, now } from '../infra/db/database.service.js';

interface CourseForSale {
  id: string;
  title: string;
  slug: string;
  summary: string;
  price_cents: number;
  currency: string;
}

/** What one purchase costs: the course price, less a coupon's discount. */
interface Pricing {
  amountCents: number;
  coupon: RedeemableCoupon | null;
}

/**
 * Selling courses with Stripe Checkout.
 *
 * The browser is only ever redirected: the enrollment is created by the
 * signed webhook, never by the student returning to the success page.
 *
 * Without a Stripe key a purchase completes instantly outside production, so
 * the whole classroom can be exercised locally. In production a paid course
 * cannot be bought without one; free courses always can.
 *
 * The amount is always worked out here, from the course price and a coupon
 * this service checked itself; the browser only ever sends the code.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly studentUrl: string;
  private readonly production: boolean;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService<Env, true>,
    private readonly coupons: CouponsService,
  ) {
    const key = config.get('STRIPE_SECRET_KEY', { infer: true });
    this.stripe = key ? new Stripe(key) : null;
    this.webhookSecret = config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
    this.studentUrl = config.get('STUDENT_APP_URL', { infer: true }).replace(/\/$/, '');
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
    if (!this.stripe) {
      this.logger.warn(
        this.production
          ? 'STRIPE_SECRET_KEY is not set: paid courses cannot be bought until it is.'
          : 'STRIPE_SECRET_KEY is not set: purchases complete instantly (dev mode).',
      );
    }
  }

  /** The price of a course with a coupon, for the buy box. Changes nothing. */
  async quote(courseId: string, couponCode: string): Promise<CheckoutQuote> {
    const course = await this.courseForSale(courseId);
    if (course.price_cents === 0) {
      throw new BadRequestException('This course is free: no coupon is needed.');
    }
    const { amountCents, coupon } = await this.price(course, couponCode);
    return {
      couponCode: coupon!.code,
      percentOff: coupon!.percentOff,
      priceCents: course.price_cents,
      discountedCents: amountCents,
      currency: course.currency,
    };
  }

  async checkout(
    user: AuthenticatedUser,
    courseId: string,
    couponCode?: string,
  ): Promise<CheckoutResult> {
    const course = await this.courseForSale(courseId);

    const owned = await this.db.one(
      'select 1 from enrollments where user_id = ?1 and course_id = ?2',
      [user.uid, courseId],
    );
    if (owned) {
      throw new ConflictException('You already own this course.');
    }

    const pricing = await this.price(course, couponCode);

    // Never in production: without Stripe a paid course would be given away.
    if (pricing.amountCents > 0 && !this.stripe && this.production) {
      throw new ServiceUnavailableException(
        'Payments are not available yet. Please try again later.',
      );
    }

    const courseUrl = `${this.studentUrl}/my-courses/${course.id}`;

    // Nothing to pay (a free course, or a 100% coupon) needs no payment page.
    if (pricing.amountCents === 0 || !this.stripe) {
      const provider =
        course.price_cents === 0 ? 'free' : pricing.amountCents === 0 ? 'coupon' : 'dev';
      const order = await this.createOrder(user.uid, course, pricing, provider);
      await this.fulfil(order);
      return { url: courseUrl, enrolled: true };
    }

    const orderId = await this.createOrder(user.uid, course, pricing, 'stripe');
    const summaryText = richTextToPlain(course.summary);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: orderId,
      ...(user.email ? { customer_email: user.email } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: course.currency,
            unit_amount: pricing.amountCents,
            product_data: {
              name: pricing.coupon
                ? `${course.title} (${pricing.coupon.percentOff}% off with ${pricing.coupon.code})`
                : course.title,
              // Stripe shows text only; the summary is HTML.
              ...(summaryText ? { description: summaryText } : {}),
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
    await this.db.query('update orders set stripe_session_id = ?2 where id = ?1', [
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
          `update orders set status = 'cancelled'
           where stripe_session_id = ?1 and status = 'pending'`,
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
      'select id from orders where stripe_session_id = ?1 or id = ?2 limit 1',
      [session.id, session.client_reference_id ?? ''],
    );
    if (!order) {
      this.logger.error(`Stripe session ${session.id} was paid but matches no order.`);
      return;
    }
    await this.fulfil(order.id);
  }

  private async courseForSale(courseId: string): Promise<CourseForSale> {
    const course = await this.db.one<CourseForSale>(
      `select id, title, slug, summary, price_cents, currency
       from courses where id = ?1 and status = 'published'`,
      [courseId],
    );
    if (!course) {
      throw new NotFoundException('That course is not available.');
    }
    return course;
  }

  /** A free course ignores any coupon; a paid one is checked and discounted. */
  private async price(course: CourseForSale, couponCode: string | undefined): Promise<Pricing> {
    if (!couponCode || course.price_cents === 0) {
      return { amountCents: course.price_cents, coupon: null };
    }
    const coupon = await this.coupons.redeemable(couponCode);
    return { amountCents: discountedPrice(course.price_cents, coupon.percentOff), coupon };
  }

  private async createOrder(
    userId: string,
    course: CourseForSale,
    pricing: Pricing,
    provider: string,
  ): Promise<string> {
    const row = await this.db.one<{ id: string }>(
      `insert into orders (user_id, course_id, amount_cents, currency, provider,
                           coupon_code, discount_percent)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7) returning id`,
      [
        userId,
        course.id,
        pricing.amountCents,
        course.currency,
        provider,
        pricing.coupon?.code ?? null,
        pricing.coupon?.percentOff ?? null,
      ],
    );
    return row!.id;
  }

  /**
   * Marks the order paid and enrolls the student, exactly once and atomically.
   *
   * Safe to run again for the same order (Stripe retries deliveries): the
   * first statement then changes nothing, and the enrollment already exists.
   */
  private async fulfil(orderId: string): Promise<void> {
    await this.db.batch([
      {
        sql: `update orders set status = 'paid', paid_at = ?2 where id = ?1 and status <> 'paid'`,
        params: [orderId, now()],
      },
      {
        sql: `insert into enrollments (user_id, course_id, order_id)
              select user_id, course_id, id from orders where id = ?1 and status = 'paid'
              on conflict (user_id, course_id) do nothing`,
        params: [orderId],
      },
    ]);
  }
}
