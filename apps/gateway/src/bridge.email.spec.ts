import { describe, expect, it } from 'vitest';
import { handleBridge } from './bridge';

function harness(options: { fail?: string } = {}) {
  const sent: EmailMessageBuilder[] = [];
  const email = {
    async send(message: EmailMessageBuilder) {
      if (options.fail) throw new Error(options.fail);
      sent.push(message);
      return { messageId: `id-${sent.length}` };
    },
  } as unknown as SendEmail;

  const send = (body: unknown, method = 'POST') =>
    handleBridge(
      new Request('http://gateway.internal/email/send', {
        method,
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      }),
      '/email/send',
      { db: {} as D1Database, files: {} as R2Bucket, email },
    );
  return { sent, send };
}

const message = {
  from: { name: 'SpeakUkrainian', email: 'no-reply@speakukrainian.org' },
  to: 'ana@example.com',
  subject: 'Hello',
  text: 'Plain',
  html: '<p>Plain</p>',
};

describe('bridge: e-mail', () => {
  it('sends a message and returns its id', async () => {
    const { sent, send } = harness();
    const response = await send(message);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messageId: 'id-1' });
    expect(sent).toEqual([message]);
  });

  it('accepts a plain address as sender, an optional reply-to, and no html', async () => {
    const { sent, send } = harness();
    await send({
      from: 'no-reply@speakukrainian.org',
      to: 'ana@example.com',
      subject: 'Hello',
      text: 'Plain',
      replyTo: 'teacher@speakukrainian.org',
    });
    expect(sent[0]).toEqual({
      from: 'no-reply@speakukrainian.org',
      to: 'ana@example.com',
      subject: 'Hello',
      text: 'Plain',
      replyTo: 'teacher@speakukrainian.org',
    });
  });

  it('reports a refusal by the provider as 502 with its message', async () => {
    const { send } = harness({ fail: 'sender domain is not verified' });
    const response = await send(message);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { message: 'sender domain is not verified', kind: 'email' },
    });
  });

  it.each([
    ['no recipient', { ...message, to: undefined }],
    ['a recipient that is not an address', { ...message, to: 'ana' }],
    ['a list of recipients', { ...message, to: ['a@example.com', 'b@example.com'] }],
    ['an empty subject', { ...message, subject: ' ' }],
    ['no text', { ...message, text: '' }],
    ['a sender without an address', { ...message, from: { name: 'X' } }],
    ['html that is not text', { ...message, html: 5 }],
  ])('rejects %s with 400 and sends nothing', async (_name, body) => {
    const { sent, send } = harness();
    expect((await send(body)).status).toBe(400);
    expect(sent).toEqual([]);
  });

  it('only accepts POST', async () => {
    const { send } = harness();
    expect((await send(undefined, 'GET')).status).toBe(404);
  });
});
