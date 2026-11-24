import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DashboardController } from '../dashboard/dashboard.controller.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { UsersService } from './users.service.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const day = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

describe('UsersService and the dashboard', () => {
  let t: TestDatabase;
  let users: UsersService;

  beforeEach(() => {
    t = createTestDatabase();
    users = new UsersService(t.db);
    t.addUser('admin', { email: 'admin@example.com', role: 'admin', fullName: 'Admin' });
    t.addUser('ana', { email: 'ana@example.com', fullName: 'Ana López' });
    t.addUser('bo', { email: 'bo_100%@example.com', fullName: 'Bo' });
    t.addUser('cy', { email: 'cy@example.com', fullName: '' });
    // Distinct sign-up times, newest last.
    for (const [index, id] of ['ana', 'bo', 'cy'].entries()) {
      t.all(
        `update "user" set "createdAt" = ? where id = ? returning id`,
        `2026-01-0${index + 1}T00:00:00.000Z`,
        id,
      );
    }

    t.all(
      `insert into courses (id, title, slug, status) values ('c1', 'Course', 'c', 'published') returning id`,
    );
    t.all(
      `insert into course_sections (id, course_id, title) values ('s1', 'c1', 'S') returning id`,
    );
    t.all(
      `insert into lessons (id, section_id, title) values ('l1', 's1', 'L1'), ('l2', 's1', 'L2'),
       ('l3', 's1', 'L3'), ('l4', 's1', 'L4') returning id`,
    );
    t.all(
      `insert into orders (id, user_id, course_id, amount_cents, currency, status, paid_at)
       values ('o1', 'ana', 'c1', 1500, 'eur', 'paid', '2026-02-01T10:00:00.000Z'),
              ('o2', 'bo', 'c1', 1500, 'eur', 'pending', null) returning id`,
    );
    t.all(
      `insert into enrollments (user_id, course_id, order_id) values ('ana', 'c1', 'o1') returning user_id`,
    );
    t.all(
      `insert into lesson_progress (user_id, lesson_id, completed_at)
       values ('ana', 'l1', '2026-02-02T00:00:00.000Z'), ('ana', 'l2', null) returning user_id`,
    );
    t.all(
      `insert into messages (student_id, sender, body) values ('ana', 'student', 'q1'),
       ('ana', 'student', 'q2'), ('ana', 'admin', 'a1') returning id`,
    );
  });

  it('lists students, newest first, without the administrator', async () => {
    t.all(
      `update "user" set "lastSignInAt" = '2026-03-01T08:00:00.000Z' where id = 'cy' returning id`,
    );
    const page = await users.list({ limit: 20, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.items.map((u) => u.id)).toEqual(['cy', 'bo', 'ana']);
    expect(page.items[0]!.lastSignInAt).toBe('2026-03-01T08:00:00.000Z');
    expect(page.items[2]).toEqual({
      id: 'ana',
      email: 'ana@example.com',
      fullName: 'Ana López',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSignInAt: null,
      courseCount: 1,
      unreadMessages: 2,
    });
  });

  it('paginates while reporting the full total', async () => {
    const page = await users.list({ limit: 1, offset: 1 });
    expect(page.total).toBe(3);
    expect(page.items.map((u) => u.id)).toEqual(['bo']);
  });

  it('searches e-mail and name, ignoring case and treating % and _ literally', async () => {
    const ids = async (search: string) =>
      (await users.list({ limit: 20, offset: 0, search })).items.map((u) => u.id);

    expect(await ids('ANA@EXAMPLE')).toEqual(['ana']);
    expect(await ids('lópez')).toEqual(['ana']);
    expect(await ids('100%')).toEqual(['bo']);
    expect(await ids('o_1')).toEqual(['bo']);
    // `_` is not a wildcard: this would match "bo_100" otherwise matched by "bo?100".
    expect(await ids('bo1100')).toEqual([]);
    expect(await ids('%')).toEqual(['bo']);
    expect(await ids('admin')).toEqual([]);
    expect((await users.list({ limit: 20, offset: 0, search: 'example.com' })).total).toBe(3);
  });

  it('counts students', async () => {
    expect(await users.countStudents()).toBe(3);
  });

  it('returns a student with their courses and progress', async () => {
    const detail = await users.findById('ana');
    expect(detail).toMatchObject({ id: 'ana', locale: 'en', notes: '', courseCount: 1 });
    expect(detail.courses).toEqual([
      { id: 'c1', title: 'Course', enrolledAt: expect.stringMatching(ISO), progressPercent: 25 },
    ]);
  });

  it('answers 404 for an unknown user and for the administrator', async () => {
    await expect(users.findById('ghost')).rejects.toBeInstanceOf(NotFoundException);
    await expect(users.findById('admin')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates the profile, creating it when missing', async () => {
    t.all(`delete from profiles where id = 'cy' returning id`);
    const updated = await users.update('cy', { fullName: 'Cy Young', locale: 'es', notes: 'vip' });
    expect(updated).toMatchObject({ fullName: 'Cy Young', locale: 'es', notes: 'vip' });
    expect((await users.update('cy', { fullName: 'Cy', locale: 'en', notes: '' })).fullName).toBe(
      'Cy',
    );
  });

  it('builds the dashboard from numbers, not strings', async () => {
    t.all(
      `insert into page_views (day, visitor_hash) values (?, 'a'), (?, 'b'), (?, 'old') returning day`,
      day(0),
      day(29),
      day(31),
    );

    const stats = await new DashboardController(t.db).stats();
    expect(stats).toEqual({
      pages: 1,
      visitors: 2,
      students: 3,
      courses: 1,
      unreadMessages: 2,
      sales: [
        {
          id: 'o1',
          paidAt: '2026-02-01T10:00:00.000Z',
          studentId: 'ana',
          studentEmail: 'ana@example.com',
          studentName: 'Ana López',
          courseId: 'c1',
          courseTitle: 'Course',
          amountCents: 1500,
          currency: 'eur',
        },
      ],
    });
  });
});
