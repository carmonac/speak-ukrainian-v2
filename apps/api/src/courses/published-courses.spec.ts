import { describe, expect, it } from 'vitest';
import type { Clock } from '../infra/clock/clock.tokens.js';
import type { CoursesService, PublishedCourse } from './courses.service.js';
import { PUBLISHED_COURSES_TTL_MS, PublishedCourses } from './published-courses.js';

function setup() {
  let time = 1_000;
  const clock: Clock = { now: () => time };
  const calls: boolean[] = [];
  let title = 'A1';
  const service = {
    listPublished: async () => {
      calls.push(true);
      return [{ title } as PublishedCourse];
    },
  } as unknown as CoursesService;
  return {
    cache: new PublishedCourses(service, clock),
    calls,
    advance: (ms: number) => (time += ms),
    rename: (value: string) => (title = value),
  };
}

describe('PublishedCourses', () => {
  it('asks for published courses only, once, and shares a load in progress', async () => {
    const { cache, calls } = setup();
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    await cache.get();
    expect(a).toBe(b);
    expect(calls).toEqual([true]);
  });

  it('reloads after the expiry', async () => {
    const { cache, calls, advance, rename } = setup();
    await cache.get();
    rename('A2');
    advance(PUBLISHED_COURSES_TTL_MS - 1);
    expect((await cache.get())[0]!.title).toBe('A1');
    advance(1);
    expect((await cache.get())[0]!.title).toBe('A2');
    expect(calls).toHaveLength(2);
  });

  it('reloads on the next visit after clear()', async () => {
    const { cache, rename } = setup();
    await cache.get();
    rename('B1');
    cache.clear();
    expect((await cache.get())[0]!.title).toBe('B1');
  });
});
