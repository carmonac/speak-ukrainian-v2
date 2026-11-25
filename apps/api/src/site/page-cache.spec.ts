import type { ConfigService } from '@nestjs/config';
import type { PageDetail, SavePageInput } from '@speakukrainian/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import type { Clock } from '../infra/clock/clock.tokens.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { PagesController } from '../pages/pages.controller.js';
import { PagesService } from '../pages/pages.service.js';
import { MAX_CACHED_PAGES, MISSING_PAGE_TTL_MS, PAGE_TTL_MS, PageCache } from './page-cache.js';
import { SiteRenderer } from './site.renderer.js';

class FakeClock implements Clock {
  private time = 1_000_000;
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}

function page(path: string, title = `Page ${path}`): PageDetail {
  return {
    id: `id-${path}`,
    title,
    path,
    isMain: path === '/',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: '<p>x</p>',
    texts: [],
  };
}

describe('PageCache', () => {
  let clock: FakeClock;
  let stored: Map<string, PageDetail>;
  let lookups: string[];
  let cache: PageCache;
  /** When set, lookups wait for `release()`. */
  let gate: { promise: Promise<void>; release: () => void } | null;

  function hold(): void {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => (release = resolve));
    gate = { promise, release };
  }

  beforeEach(() => {
    clock = new FakeClock();
    stored = new Map([['/about', page('/about')]]);
    lookups = [];
    gate = null;
    const pages = {
      findByPath: async (path: string) => {
        lookups.push(path);
        // Read first, then wait: what a slow query that started before an
        // edit would return.
        const found = stored.get(path) ?? null;
        await gate?.promise;
        return found;
      },
    } as unknown as PagesService;
    cache = new PageCache(pages, clock);
  });

  it('asks the database once for repeated visits to a page', async () => {
    const first = await cache.get('/about');
    const second = await cache.get('/about');
    const third = await cache.get('/about');

    expect(first?.title).toBe('Page /about');
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(lookups).toEqual(['/about']);
  });

  it('remembers that a path has no page, without asking again', async () => {
    expect(await cache.get('/nope')).toBeNull();
    expect(await cache.get('/nope')).toBeNull();
    expect(lookups).toEqual(['/nope']);
  });

  it('asks again once a page entry has expired', async () => {
    await cache.get('/about');
    clock.advance(PAGE_TTL_MS - 1);
    await cache.get('/about');
    expect(lookups).toHaveLength(1);

    clock.advance(1);
    stored.set('/about', page('/about', 'Edited elsewhere'));
    expect((await cache.get('/about'))?.title).toBe('Edited elsewhere');
    expect(lookups).toHaveLength(2);
  });

  it('forgets a missing page sooner than a found one', async () => {
    expect(MISSING_PAGE_TTL_MS).toBeLessThan(PAGE_TTL_MS);
    await cache.get('/soon');
    clock.advance(MISSING_PAGE_TTL_MS);
    stored.set('/soon', page('/soon'));
    expect((await cache.get('/soon'))?.path).toBe('/soon');
  });

  it('serves fresh data right after being cleared', async () => {
    await cache.get('/about');
    await cache.get('/new');

    stored.set('/about', page('/about', 'Renamed'));
    stored.set('/new', page('/new'));
    cache.clear();

    expect(cache.size).toBe(0);
    expect((await cache.get('/about'))?.title).toBe('Renamed');
    expect((await cache.get('/new'))?.path).toBe('/new');
  });

  it('never holds more than its limit, however many unknown paths are requested', async () => {
    for (let i = 0; i < MAX_CACHED_PAGES + 250; i++) {
      await cache.get(`/random-${i}`);
    }
    expect(cache.size).toBe(MAX_CACHED_PAGES);

    // The oldest were dropped, the newest kept.
    lookups.length = 0;
    await cache.get(`/random-${MAX_CACHED_PAGES + 249}`);
    expect(lookups).toEqual([]);
    await cache.get('/random-0');
    expect(lookups).toEqual(['/random-0']);
  });

  it('shares one lookup between simultaneous first visits', async () => {
    hold();
    const visits = [cache.get('/about'), cache.get('/about'), cache.get('/about')];
    gate!.release();
    const pages = await Promise.all(visits);

    expect(lookups).toEqual(['/about']);
    expect(pages.every((p) => p === pages[0])).toBe(true);
  });

  it('does not keep the result of a lookup that an edit overtook', async () => {
    hold();
    const slow = cache.get('/about');

    // The administrator saves while the first lookup is still running.
    stored.set('/about', page('/about', 'After the edit'));
    cache.clear();
    gate!.release();

    // The visitor who was already waiting gets what was read...
    expect((await slow)?.title).toBe('Page /about');
    // ...but the next one gets the edit, not a remembered old copy.
    gate = null;
    expect((await cache.get('/about'))?.title).toBe('After the edit');
  });

  it('retries after a failed lookup instead of remembering the failure', async () => {
    const failing = new PageCache(
      {
        findByPath: async () => {
          lookups.push('fail');
          throw new Error('database unavailable');
        },
      } as unknown as PagesService,
      clock,
    );
    await expect(failing.get('/about')).rejects.toThrow('database unavailable');
    await expect(failing.get('/about')).rejects.toThrow('database unavailable');
    expect(lookups).toEqual(['fail', 'fail']);
    expect(failing.size).toBe(0);
  });
});

/** The real services on the real schema: what a visit and an edit cost in SQL. */
describe('public pages through the cache', () => {
  let t: TestDatabase;
  let clock: FakeClock;
  let pages: PagesService;
  let cache: PageCache;
  let controller: PagesController;

  const input = (overrides: Partial<SavePageInput> = {}): SavePageInput => ({
    title: 'About',
    path: '/about',
    content: '<h1>{{ heading }}</h1>',
    texts: [{ key: 'heading', translations: [{ locale: 'en', value: 'About us' }] }],
    ...overrides,
  });
  const queries = (): number => t.driver.statements.length;

  beforeEach(() => {
    t = createTestDatabase();
    clock = new FakeClock();
    pages = new PagesService(t.db);
    cache = new PageCache(pages, clock);
    const config = { get: () => 'http://localhost' } as unknown as ConfigService<Env, true>;
    controller = new PagesController(pages, new SiteRenderer(config), cache);
  });

  it('reads the main page from the database once, then not at all', async () => {
    const before = queries();
    expect((await cache.get('/'))?.title).toBe('SpeakUkrainian');
    const afterFirst = queries();
    expect(afterFirst - before).toBe(2);

    for (let i = 0; i < 20; i++) {
      await cache.get('/');
    }
    expect(queries()).toBe(afterFirst);
  });

  it('costs one query for an unknown path, then none until it expires', async () => {
    const before = queries();
    for (let i = 0; i < 10; i++) {
      expect(await cache.get('/missing')).toBeNull();
    }
    expect(queries() - before).toBe(1);

    clock.advance(MISSING_PAGE_TTL_MS);
    await cache.get('/missing');
    expect(queries() - before).toBe(2);
  });

  it('shows a new page, an edit and a deletion on the very next visit', async () => {
    expect(await cache.get('/about')).toBeNull();

    const created = await controller.create(input());
    expect((await cache.get('/about'))?.title).toBe('About');

    await controller.update(created.id, input({ title: 'About, edited' }));
    expect((await cache.get('/about'))?.title).toBe('About, edited');

    await controller.remove(created.id);
    expect(await cache.get('/about')).toBeNull();
  });

  it('follows a path rename: the old address stops answering, the new one starts', async () => {
    const created = await controller.create(input());
    await cache.get('/about');
    expect(await cache.get('/company')).toBeNull();

    await controller.update(created.id, input({ path: '/company' }));

    expect(await cache.get('/about')).toBeNull();
    expect((await cache.get('/company'))?.title).toBe('About');
  });

  it('follows a change of main page', async () => {
    const other = await controller.create(input({ title: 'New home', path: '/home' }));
    expect((await cache.get('/'))?.title).toBe('SpeakUkrainian');

    // The panel has no route for this yet; do what one would do, then publish
    // the way every page route does.
    await t.db.batch([
      { sql: 'update pages set is_main = 0 where is_main = 1' },
      { sql: 'update pages set is_main = 1 where id = ?1', params: [other.id] },
    ]);
    await controller.update(other.id, input({ title: 'New home', path: '/home' }));

    expect((await cache.get('/'))?.title).toBe('New home');
  });

  it('leaves the control panel reading the database every time', async () => {
    const created = await controller.create(input());
    await cache.get('/about');

    const before = queries();
    await controller.findOne(created.id);
    await controller.findOne(created.id);
    await controller.main();
    await controller.list();
    expect(queries() - before).toBeGreaterThanOrEqual(7);

    // A change made behind the cache's back is what the panel shows...
    t.all(`update pages set title = 'Changed directly' where id = ? returning id`, created.id);
    expect((await controller.findOne(created.id)).title).toBe('Changed directly');
    // ...while the site keeps its copy until it expires.
    expect((await cache.get('/about'))?.title).toBe('About');
    clock.advance(PAGE_TTL_MS);
    expect((await cache.get('/about'))?.title).toBe('Changed directly');
  });
});
