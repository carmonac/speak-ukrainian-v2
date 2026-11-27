import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { Env } from '../config/configuration.js';
import { CoursesService } from '../courses/courses.service.js';
import type { H5pService } from '../h5p/h5p.service.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { PaymentsService } from '../payments/payments.service.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { MeService } from './me.service.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const student: AuthenticatedUser = { uid: 'u1', email: 'u1@example.com', role: 'student' };

/** No Stripe key: a purchase completes instantly, as in local development. */
const config = {
  get: (key: string) => (key === 'STUDENT_APP_URL' ? 'http://localhost:4300/' : undefined),
} as unknown as ConfigService<Env, true>;

describe('student flows: checkout, my courses, progress', () => {
  let t: TestDatabase;
  let courses: CoursesService;
  let payments: PaymentsService;
  let me: MeService;
  let courseId: string;
  let lessonIds: string[];

  beforeEach(async () => {
    t = createTestDatabase();
    t.addUser('u1', { fullName: 'Ana' });
    courses = new CoursesService(t.db, { remove: async () => undefined } as unknown as H5pService);
    payments = new PaymentsService(
      t.db,
      config,
      new CouponsService(t.db, { now: () => Date.now() }),
    );
    me = new MeService(t.db, courses);

    const created = await courses.create({
      title: 'Paid course',
      slug: 'paid',
      summary: '',
      description: '',
      priceCents: 1000,
      currency: 'eur',
      status: 'published',
      sections: [
        {
          title: 'S',
          lessons: [
            { title: 'L1', introText: '', h5pContentId: null },
            { title: 'L2', introText: '', h5pContentId: null },
          ],
        },
      ],
    });
    courseId = created.id;
    lessonIds = created.sections[0]!.lessons.map((l) => l.id);
  });

  describe('checkout', () => {
    it('creates a paid order and enrolls the student', async () => {
      const result = await payments.checkout(student, courseId);
      expect(result).toEqual({
        url: `http://localhost:4300/my-courses/${courseId}`,
        enrolled: true,
      });

      const orders = t.all<{
        status: string;
        paid_at: string;
        provider: string;
        amount_cents: number;
      }>('select status, paid_at, provider, amount_cents from orders');
      expect(orders).toEqual([
        {
          status: 'paid',
          paid_at: expect.stringMatching(ISO),
          provider: 'dev',
          amount_cents: 1000,
        },
      ]);
      expect(t.all('select user_id, course_id from enrollments')).toEqual([
        { user_id: 'u1', course_id: courseId },
      ]);
    });

    it('refuses a second purchase, an unpublished course and an unknown one', async () => {
      await payments.checkout(student, courseId);
      await expect(payments.checkout(student, courseId)).rejects.toBeInstanceOf(ConflictException);
      await expect(payments.checkout(student, 'nope')).rejects.toBeInstanceOf(NotFoundException);

      t.all(`update courses set status = 'draft' where id = ? returning id`, courseId);
      t.addUser('u2');
      await expect(
        payments.checkout({ uid: 'u2', email: undefined, role: 'student' }, courseId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('fulfils an order exactly once, however many times it is delivered', async () => {
      await payments.checkout(student, courseId);
      const [{ id: orderId, paid_at: firstPaidAt }] = t.all<{ id: string; paid_at: string }>(
        'select id, paid_at from orders',
      ) as [{ id: string; paid_at: string }];

      const fulfil = (payments as unknown as { fulfil(id: string): Promise<void> }).fulfil.bind(
        payments,
      );
      await fulfil(orderId);
      await fulfil(orderId);

      expect(t.all('select count(*) as n from enrollments')).toEqual([{ n: 1 }]);
      expect(t.all('select paid_at from orders')).toEqual([{ paid_at: firstPaidAt }]);
    });

    it('does not enroll anyone for an order that does not exist', async () => {
      const fulfil = (payments as unknown as { fulfil(id: string): Promise<void> }).fulfil.bind(
        payments,
      );
      await fulfil('ghost');
      expect(t.all('select count(*) as n from enrollments')).toEqual([{ n: 0 }]);
    });
  });

  describe('checkout in production without Stripe', () => {
    const productionConfig = {
      get: (key: string) =>
        key === 'STUDENT_APP_URL'
          ? 'http://localhost:4300/'
          : key === 'NODE_ENV'
            ? 'production'
            : undefined,
    } as unknown as ConfigService<Env, true>;

    it('refuses a paid course instead of giving it away, and writes nothing', async () => {
      const production = new PaymentsService(
        t.db,
        productionConfig,
        new CouponsService(t.db, { now: () => Date.now() }),
      );
      await expect(production.checkout(student, courseId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(t.all('select count(*) as n from orders')).toEqual([{ n: 0 }]);
      expect(t.all('select count(*) as n from enrollments')).toEqual([{ n: 0 }]);
    });

    it('still enrolls in a free course', async () => {
      t.all(`update courses set price_cents = 0 where id = ? returning id`, courseId);
      const production = new PaymentsService(
        t.db,
        productionConfig,
        new CouponsService(t.db, { now: () => Date.now() }),
      );
      expect((await production.checkout(student, courseId)).enrolled).toBe(true);
      expect(t.all('select provider, status from orders')).toEqual([
        { provider: 'free', status: 'paid' },
      ]);
    });
  });

  describe('profile', () => {
    it('reads and updates the profile', async () => {
      expect(await me.profile(student)).toEqual({
        id: 'u1',
        email: 'u1@example.com',
        fullName: 'Ana',
        locale: 'en',
      });
      expect((await me.updateProfile(student, { fullName: 'Ana María' })).fullName).toBe(
        'Ana María',
      );
    });

    it('creates the profile row when it is missing', async () => {
      t.all(`delete from profiles where id = 'u1' returning id`);
      expect((await me.profile(student)).fullName).toBe('');
      expect((await me.updateProfile(student, { fullName: 'New' })).fullName).toBe('New');
    });
  });

  describe('courses and progress', () => {
    beforeEach(async () => {
      await payments.checkout(student, courseId);
    });

    it('lists owned courses with progress as numbers', async () => {
      expect(await me.myCourses('u1')).toEqual([
        expect.objectContaining({
          id: courseId,
          lessonCount: 2,
          completedLessons: 0,
          progressPercent: 0,
        }),
      ]);

      await me.recordResult('u1', lessonIds[0]!, { completed: true, score: 3, maxScore: 5 });
      expect(await me.myCourses('u1')).toEqual([
        expect.objectContaining({ completedLessons: 1, progressPercent: 50 }),
      ]);
    });

    it('returns the course with per-lesson progress, and only to its owner', async () => {
      await me.recordResult('u1', lessonIds[0]!, { completed: true, score: 3.5, maxScore: 5 });

      const detail = await me.myCourse('u1', courseId);
      expect(detail.progressPercent).toBe(50);
      expect(detail.progress).toEqual([
        {
          lessonId: lessonIds[0],
          completed: true,
          score: 3.5,
          maxScore: 5,
          completedAt: expect.stringMatching(ISO),
        },
      ]);

      t.addUser('u2');
      await expect(me.myCourse('u2', courseId)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('keeps the best score and never un-completes a lesson', async () => {
      const lessonId = lessonIds[0]!;
      const first = await me.recordResult('u1', lessonId, {
        completed: true,
        score: 4,
        maxScore: 5,
      });
      expect(first).toEqual({
        lessonId,
        completed: true,
        score: 4,
        maxScore: 5,
        completedAt: expect.stringMatching(ISO),
      });

      // A worse retry, reported as not completed.
      const worse = await me.recordResult('u1', lessonId, {
        completed: false,
        score: 2,
        maxScore: 5,
      });
      expect(worse).toMatchObject({ completed: true, score: 4, maxScore: 5 });
      expect(worse.completedAt).toBe(first.completedAt);

      // A better one.
      expect(
        await me.recordResult('u1', lessonId, { completed: true, score: 5, maxScore: 5 }),
      ).toMatchObject({
        score: 5,
      });

      // A result without a score leaves the stored one alone.
      expect(
        await me.recordResult('u1', lessonId, { completed: true, score: null, maxScore: null }),
      ).toMatchObject({ score: 5, maxScore: 5 });

      // The exercise changed its maximum: the new score replaces the old one.
      expect(
        await me.recordResult('u1', lessonId, { completed: true, score: 1, maxScore: 10 }),
      ).toMatchObject({
        score: 1,
        maxScore: 10,
      });
    });

    it('treats two missing maximums as the same scale', async () => {
      const lessonId = lessonIds[1]!;
      await me.recordResult('u1', lessonId, { completed: false, score: 7, maxScore: null });
      const second = await me.recordResult('u1', lessonId, {
        completed: false,
        score: 3,
        maxScore: null,
      });
      expect(second).toEqual({
        lessonId,
        completed: false,
        score: 7,
        maxScore: null,
        completedAt: null,
      });
    });

    it('refuses a result for a lesson of a course the student does not own', async () => {
      t.addUser('u2');
      await expect(
        me.recordResult('u2', lessonIds[0]!, { completed: true, score: null, maxScore: null }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        me.recordResult('u1', 'nope', { completed: true, score: null, maxScore: null }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
