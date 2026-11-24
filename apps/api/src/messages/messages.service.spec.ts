import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/configuration.js';
import type { EmailService, OutgoingEmail } from '../email/email.service.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { MessagesService } from './messages.service.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const config = {
  get: (key: string) =>
    key === 'CHAT_REMINDER_AFTER_HOURS'
      ? 24
      : key === 'STUDENT_APP_URL'
        ? 'http://student/'
        : undefined,
} as unknown as ConfigService<Env, true>;

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

describe('MessagesService', () => {
  let t: TestDatabase;
  let sent: OutgoingEmail[];
  let service: MessagesService;

  /** Inserts a message with a chosen age, bypassing the service. */
  const seed = (studentId: string, sender: 'admin' | 'student', body: string, createdAt: string) =>
    t.all(
      'insert into messages (student_id, sender, body, created_at) values (?, ?, ?, ?) returning id',
      studentId,
      sender,
      body,
      createdAt,
    );

  beforeEach(() => {
    t = createTestDatabase();
    t.addUser('ana', { email: 'ana@example.com', fullName: 'Ana' });
    t.addUser('bo', { email: 'bo@example.com' });
    sent = [];
    const email = {
      send: async (e: OutgoingEmail) => void sent.push(e),
    } as unknown as EmailService;
    service = new MessagesService(t.db, email, config);
  });

  it('sends a message and returns it with its lesson and course titles', async () => {
    t.all(`insert into courses (id, title, slug) values ('c1', 'Course', 'c') returning id`);
    t.all(
      `insert into course_sections (id, course_id, title) values ('s1', 'c1', 'S') returning id`,
    );
    t.all(`insert into lessons (id, section_id, title) values ('l1', 's1', 'Lesson') returning id`);

    const message = await service.send('ana', 'student', 'Question', 'l1');
    expect(message).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      studentId: 'ana',
      sender: 'student',
      body: 'Question',
      lessonId: 'l1',
      lessonTitle: 'Lesson',
      courseTitle: 'Course',
      createdAt: expect.stringMatching(ISO),
      readAt: null,
    });
  });

  it('drops a lesson reference that does not exist instead of failing', async () => {
    const message = await service.send('ana', 'student', 'Hi', 'ghost-lesson');
    expect(message.lessonId).toBeNull();
  });

  it('refuses an admin message to an unknown user', async () => {
    await expect(service.send('ghost', 'admin', 'Hello')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a thread oldest first', async () => {
    seed('ana', 'student', 'first', hoursAgo(3));
    seed('ana', 'admin', 'second', hoursAgo(2));
    seed('bo', 'student', 'other thread', hoursAgo(1));
    expect((await service.thread('ana')).map((m) => m.body)).toEqual(['first', 'second']);
  });

  it('counts and marks as read only what the other party wrote', async () => {
    seed('ana', 'student', 'from student', hoursAgo(3));
    seed('ana', 'admin', 'from admin 1', hoursAgo(2));
    seed('ana', 'admin', 'from admin 2', hoursAgo(1));

    expect(await service.unreadCount('ana', 'student')).toBe(2);
    expect(await service.unreadCount('ana', 'admin')).toBe(1);
    expect(await service.totalUnreadFromStudents()).toBe(1);

    await service.markRead('ana', 'student');
    expect(await service.unreadCount('ana', 'student')).toBe(0);
    expect(await service.unreadCount('ana', 'admin')).toBe(1);
    const thread = await service.thread('ana');
    expect(thread.map((m) => m.readAt === null)).toEqual([true, false, false]);
    expect(thread[1]!.readAt).toMatch(ISO);
  });

  it('lists one row per conversation with its latest message, most recent first', async () => {
    seed('ana', 'student', 'old from ana', hoursAgo(10));
    seed('ana', 'admin', 'latest for ana', hoursAgo(5));
    seed('bo', 'student', 'x'.repeat(200), hoursAgo(1));
    seed('bo', 'student', 'older from bo', hoursAgo(2));

    const conversations = await service.conversations();
    expect(conversations).toEqual([
      {
        studentId: 'bo',
        email: 'bo@example.com',
        fullName: '',
        lastMessage: `${'x'.repeat(140)}…`,
        lastMessageAt: expect.stringMatching(ISO),
        lastSender: 'student',
        unread: 2,
      },
      {
        studentId: 'ana',
        email: 'ana@example.com',
        fullName: 'Ana',
        lastMessage: 'latest for ana',
        lastMessageAt: expect.stringMatching(ISO),
        lastSender: 'admin',
        unread: 1,
      },
    ]);
  });

  describe('reminders', () => {
    it('emails a student whose unread admin message is older than the delay, once', async () => {
      seed('ana', 'admin', 'please answer', hoursAgo(30));
      seed('ana', 'admin', 'and this', hoursAgo(26));

      expect(await service.sendReminders()).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: 'ana@example.com',
        userId: 'ana',
        kind: 'chat-reminder',
      });
      expect(sent[0]!.text).toContain('2 new messages');
      expect(sent[0]!.text).toContain('http://student/messages');
      expect(t.all('select count(*) as n from messages where reminder_sent_at is null')).toEqual([
        { n: 0 },
      ]);

      expect(await service.sendReminders()).toBe(0);
      expect(sent).toHaveLength(1);
    });

    it('waits until the delay has passed', async () => {
      seed('ana', 'admin', 'recent', hoursAgo(23));
      expect(await service.sendReminders()).toBe(0);
    });

    it('skips messages the student read or answered afterwards', async () => {
      seed('ana', 'admin', 'answered later', hoursAgo(30));
      seed('ana', 'student', 'my answer', hoursAgo(29));
      t.all(
        `insert into messages (student_id, sender, body, created_at, read_at)
         values ('bo', 'admin', 'already read', ?, ?) returning id`,
        hoursAgo(30),
        hoursAgo(28),
      );
      expect(await service.sendReminders()).toBe(0);
      expect(sent).toEqual([]);
    });
  });
});
