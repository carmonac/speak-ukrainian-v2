import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import type { EmailService, OutgoingEmail } from '../email/email.service.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { MessagesService } from './messages.service.js';
import { RemindersController } from './reminders.controller.js';

const SECRET = 'a-long-enough-cron-secret';

describe('RemindersController', () => {
  let t: TestDatabase;
  let sent: OutgoingEmail[];

  function controller(secret: string | undefined): RemindersController {
    const config = {
      get: (key: string) =>
        key === 'CRON_SECRET'
          ? secret
          : key === 'CHAT_REMINDER_AFTER_HOURS'
            ? 24
            : 'http://student',
    } as unknown as ConfigService<Env, true>;
    const email = {
      send: async (e: OutgoingEmail) => void sent.push(e),
    } as unknown as EmailService;
    return new RemindersController(new MessagesService(t.db, email, config), config);
  }

  beforeEach(() => {
    t = createTestDatabase();
    t.addUser('ana', { email: 'ana@example.com' });
    sent = [];
    t.all(
      `insert into messages (student_id, sender, body, created_at)
       values ('ana', 'admin', 'please answer', ?) returning id`,
      new Date(Date.now() - 30 * 3_600_000).toISOString(),
    );
  });

  it('sends the due reminders when the secret matches', async () => {
    expect(await controller(SECRET).chatReminders(SECRET)).toEqual({ sent: 1 });
    expect(sent.map((e) => [e.to, e.kind])).toEqual([['ana@example.com', 'chat-reminder']]);
  });

  it('reminds nobody twice: a second run the same day sends nothing', async () => {
    const reminders = controller(SECRET);
    await reminders.chatReminders(SECRET);
    expect(await reminders.chatReminders(SECRET)).toEqual({ sent: 0 });
    expect(sent).toHaveLength(1);
  });

  it.each([
    ['no secret', undefined],
    ['an empty one', ''],
    ['a wrong one of the same length', 'x'.repeat(SECRET.length)],
    ['a prefix of the right one', SECRET.slice(0, -1)],
  ])('refuses %s and sends nothing', async (_name, presented) => {
    await expect(controller(SECRET).chatReminders(presented)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(sent).toEqual([]);
  });

  it('is switched off when no secret is configured, whatever is presented', async () => {
    await expect(controller(undefined).chatReminders('')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller(undefined).chatReminders('anything')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(sent).toEqual([]);
  });
});
