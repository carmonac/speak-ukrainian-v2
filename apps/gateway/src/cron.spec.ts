import { describe, expect, it } from 'vitest';
import { runDailyJobs } from './cron';

describe('runDailyJobs', () => {
  it('posts to the reminder endpoint with the secret and reports the answer', async () => {
    const seen: Request[] = [];
    const result = await runDailyJobs('s3cret-s3cret-s3cret', async (request) => {
      seen.push(request);
      return Response.json({ sent: 2 });
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('POST');
    expect(new URL(seen[0]!.url).pathname).toBe('/api/internal/chat-reminders');
    expect(seen[0]!.headers.get('x-cron-secret')).toBe('s3cret-s3cret-s3cret');
    expect(result).toEqual({ ok: true, status: 200, detail: '{"sent":2}' });
  });

  it('reports a refusal by the API', async () => {
    const result = await runDailyJobs(
      'wrong',
      async () => new Response('Forbidden', { status: 403 }),
    );
    expect(result).toEqual({ ok: false, status: 403, detail: 'Forbidden' });
  });

  it('calls nothing when no secret is configured', async () => {
    let called = false;
    const result = await runDailyJobs(undefined, async () => {
      called = true;
      return new Response();
    });
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
  });
});
