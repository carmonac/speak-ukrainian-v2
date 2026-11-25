import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.js';
import type { Env } from '../config/configuration.js';
import type { BridgeClient, BridgeRequest } from '../infra/bridge/bridge.client.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { EmailService, parseSender } from './email.service.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('EmailService', () => {
  let t: TestDatabase;
  let requests: BridgeRequest[];
  let answer: () => Response;

  const bridge = {
    send: async (request: BridgeRequest) => {
      requests.push(request);
      return answer();
    },
    failureOf: async (response: Response) => {
      const body = (await response.json()) as { error: { message: string } };
      return { message: body.error.message, kind: 'email' };
    },
  } as unknown as BridgeClient;

  const service = (delivery: 'send' | 'log') =>
    new EmailService(
      {
        get: (key: string) =>
          key === 'EMAIL_FROM' ? 'SpeakUkrainian <no-reply@speakukrainian.org>' : delivery,
      } as unknown as ConfigService<Env, true>,
      t.db,
      bridge,
    );

  const log = () =>
    t.all('select to_user, to_email, subject, kind, sent_at, status, error from email_log');

  beforeEach(() => {
    t = createTestDatabase();
    t.addUser('ana', { email: 'ana@example.com' });
    requests = [];
    answer = () => Response.json({ messageId: 'm1' });
  });

  it('hands the message to the bridge with a text and an HTML body, and records it', async () => {
    await service('send').send({
      to: 'ana@example.com',
      userId: 'ana',
      subject: 'Hello',
      text: 'Line 1\nLine <2> & "3"',
      kind: 'admin-message',
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/email/send' });
    expect(JSON.parse(requests[0]!.body as string)).toEqual({
      from: { name: 'SpeakUkrainian', email: 'no-reply@speakukrainian.org' },
      to: 'ana@example.com',
      subject: 'Hello',
      text: 'Line 1\nLine <2> & "3"',
      html: expect.stringContaining('Line 1<br />Line &lt;2&gt; &amp; &quot;3&quot;'),
    });
    expect(log()).toEqual([
      {
        to_user: 'ana',
        to_email: 'ana@example.com',
        subject: 'Hello',
        kind: 'admin-message',
        sent_at: expect.stringMatching(ISO),
        status: 'sent',
        error: null,
      },
    ]);
  });

  it('records a refused send as failed, with the reason, and still rejects', async () => {
    answer = () =>
      Response.json({ error: { message: 'recipient is suppressed' } }, { status: 502 });

    await expect(
      service('send').send({ to: 'x@example.com', subject: 'S', text: 'T', kind: 'chat-reminder' }),
    ).rejects.toThrow(/recipient is suppressed/);

    expect(log()).toEqual([
      expect.objectContaining({
        to_user: null,
        to_email: 'x@example.com',
        kind: 'chat-reminder',
        status: 'failed',
        error: expect.stringContaining('recipient is suppressed'),
      }),
    ]);
  });

  it('only logs when delivery is off, and says so in the log table', async () => {
    await service('log').send({ to: 'ana@example.com', subject: 'S', text: 'T', kind: 'k' });
    expect(requests).toEqual([]);
    expect(log()).toEqual([expect.objectContaining({ status: 'logged', error: null })]);
  });

  it('carries the password-reset e-mails of better-auth', async () => {
    const email = service('send');
    const auth = createAuth({
      db: t.db,
      secret: 'test-secret-test-secret-test-secret-1234',
      baseUrl: 'http://localhost:8080',
      trustedOrigins: ['http://localhost:4300'],
      studentAppUrl: 'http://localhost:4300',
      adminAppUrl: 'http://localhost:4200',
      production: false,
      sendEmail: (message) => email.send(message),
      onError: () => undefined,
    });
    const call = (path: string, body: unknown) =>
      auth.handler(
        new Request(`http://localhost:8080/api/auth${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:4300' },
          body: JSON.stringify(body),
        }),
      );

    await call('/sign-up/email', {
      email: 'bo@example.com',
      password: 'correct horse',
      name: 'Bo',
    });
    await call('/request-password-reset', { email: 'bo@example.com' });

    await expect.poll(() => log().length).toBe(1);
    expect(log()[0]).toMatchObject({
      to_email: 'bo@example.com',
      kind: 'password-reset',
      status: 'sent',
    });
    const sent = JSON.parse(requests[0]!.body as string) as { text: string; to: string };
    expect(sent.to).toBe('bo@example.com');
    expect(sent.text).toContain('http://localhost:4300/reset-password?token=');
  });
});

describe('parseSender', () => {
  it('splits a display name from its address', () => {
    expect(parseSender('SpeakUkrainian <no-reply@speakukrainian.org>')).toEqual({
      name: 'SpeakUkrainian',
      email: 'no-reply@speakukrainian.org',
    });
    expect(parseSender('"Speak Ukrainian" <a@b.org>')).toEqual({
      name: 'Speak Ukrainian',
      email: 'a@b.org',
    });
  });

  it('keeps a bare address, with or without brackets', () => {
    expect(parseSender(' no-reply@speakukrainian.org ')).toBe('no-reply@speakukrainian.org');
    expect(parseSender('<no-reply@speakukrainian.org>')).toBe('no-reply@speakukrainian.org');
  });
});
