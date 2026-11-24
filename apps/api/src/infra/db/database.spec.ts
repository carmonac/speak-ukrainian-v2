import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';
import { H5pContentRepository } from '../../h5p/h5p-content.repository.js';
import { BridgeDriver } from './bridge.driver.js';
import { DatabaseError, isForeignKeyViolation, isUniqueViolation } from './database.service.js';
import { createTestDatabase, type TestDatabase } from './sqlite.test-driver.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('DatabaseService', () => {
  let t: TestDatabase;
  beforeEach(() => {
    t = createTestDatabase();
  });

  it('reuses a numbered placeholder and binds undefined and booleans', async () => {
    expect(
      await t.db.one('select ?1 as a, ?2 as b, ?1 as again, ?3 as c', ['x', undefined, true]),
    ).toEqual({
      a: 'x',
      b: null,
      again: 'x',
      c: 1,
    });
  });

  it('reports rows written and returns nothing for an empty batch', async () => {
    const inserted = await t.db.query(
      `insert into courses (title, slug) values ('A', 'a'), ('B', 'b')`,
    );
    expect(inserted.rowCount).toBe(2);
    expect((await t.db.query(`update courses set title = 'x' where slug = 'nope'`)).rowCount).toBe(
      0,
    );
    expect(await t.db.batch([])).toEqual([]);
  });

  it('applies a batch entirely or not at all', async () => {
    await expect(
      t.db.batch([
        { sql: `insert into courses (title, slug) values ('A', 'a')` },
        { sql: `insert into courses (title, slug) values ('B', 'a')` },
      ]),
    ).rejects.toSatisfy(isUniqueViolation);
    expect(await t.db.one('select count(*) as n from courses')).toEqual({ n: 0 });
  });

  it('classifies constraint failures', async () => {
    const orphan = t.db.query(`insert into profiles (id) values ('ghost')`);
    await expect(orphan).rejects.toSatisfy(isForeignKeyViolation);
    await expect(orphan).rejects.not.toSatisfy(isUniqueViolation);
    await expect(t.db.query('select * from nowhere')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('BridgeDriver', () => {
  const config = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService<Env, true>;
  let calls: { url: string; init: RequestInit }[];

  function respondWith(status: number, body: unknown): void {
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    });
  }

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts a query with the secret and maps the result', async () => {
    respondWith(200, { results: [{ n: 1 }], meta: { changes: 3 } });
    const driver = new BridgeDriver(
      config({ BRIDGE_URL: 'http://localhost:8787/__bridge/', BRIDGE_SECRET: 's3' }),
    );

    expect(await driver.query({ sql: 'select ?1', params: ['a', undefined] })).toEqual({
      rows: [{ n: 1 }],
      rowCount: 3,
    });
    expect(calls[0]!.url).toBe('http://localhost:8787/__bridge/d1/query');
    expect(calls[0]!.init.headers).toMatchObject({ 'x-bridge-secret': 's3' });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      sql: 'select ?1',
      params: ['a', null],
    });
  });

  it('posts a batch, without a secret header when none is configured', async () => {
    respondWith(200, { results: [{ results: [], meta: { changes: 1 } }] });
    const driver = new BridgeDriver(config({ BRIDGE_URL: 'http://gateway.internal' }));

    expect(await driver.batch([{ sql: 'delete from a' }])).toEqual([{ rows: [], rowCount: 1 }]);
    expect(calls[0]!.url).toBe('http://gateway.internal/d1/batch');
    expect(calls[0]!.init.headers).not.toHaveProperty('x-bridge-secret');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      statements: [{ sql: 'delete from a', params: [] }],
    });
  });

  it('turns a SQL failure reported by D1 into a classified DatabaseError', async () => {
    respondWith(422, {
      error: {
        kind: 'sql',
        message: 'D1_ERROR: UNIQUE constraint failed: pages.path: SQLITE_CONSTRAINT',
      },
    });
    const driver = new BridgeDriver(config({ BRIDGE_URL: 'http://gateway.internal' }));
    await expect(driver.query({ sql: 'insert' })).rejects.toSatisfy(isUniqueViolation);
  });

  it('does not mistake a refused or unreachable bridge for a SQL error', async () => {
    respondWith(403, {});
    const driver = new BridgeDriver(config({ BRIDGE_URL: 'http://gateway.internal' }));
    await expect(driver.query({ sql: 'select 1' })).rejects.not.toBeInstanceOf(DatabaseError);

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    await expect(driver.query({ sql: 'select 1' })).rejects.toThrow(/could not be reached/);
  });
});

describe('H5pContentRepository', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  let t: TestDatabase;
  let repository: H5pContentRepository;

  beforeEach(() => {
    t = createTestDatabase();
    t.addUser('admin', { role: 'admin' });
    repository = new H5pContentRepository(t.db);
  });

  const create = (id = ID) =>
    repository.create(
      {
        id,
        title: 'Quiz',
        mainLibrary: 'H5P.Quiz 1.0',
        storagePath: `h5p/content/${id}`,
        sizeBytes: 2048,
      },
      'admin',
    );

  it('creates, reads, updates and deletes an exercise', async () => {
    const created = await create();
    expect(created).toEqual({
      id: ID,
      title: 'Quiz',
      mainLibrary: 'H5P.Quiz 1.0',
      storagePath: `h5p/content/${ID}`,
      sizeBytes: 2048,
      createdAt: expect.stringMatching(ISO),
      updatedAt: expect.stringMatching(ISO),
    });
    expect(await repository.findById(ID)).toEqual(created);
    expect(await repository.exists(ID)).toBe(true);

    const updated = await repository.update(
      ID,
      { title: 'Quiz 2', mainLibrary: 'H5P.Quiz 1.1', sizeBytes: 4096 },
      'admin',
    );
    expect(updated).toMatchObject({
      title: 'Quiz 2',
      mainLibrary: 'H5P.Quiz 1.1',
      sizeBytes: 4096,
    });
    expect(
      await repository.update('22222222-2222-4222-8222-222222222222', updated!, 'admin'),
    ).toBeNull();

    await repository.delete(ID);
    expect(await repository.findById(ID)).toBeNull();
  });

  it('treats a malformed id as not found', async () => {
    expect(await repository.findById('../etc')).toBeNull();
    expect(await repository.exists('nope')).toBe(false);
    expect(await repository.isPlayableBy('nope', 'admin')).toBe(false);
  });

  it('lists newest first with a numeric total', async () => {
    await create();
    await create('33333333-3333-4333-8333-333333333333');
    t.all(
      `update h5p_content set created_at = '2020-01-01T00:00:00.000Z' where id = ? returning id`,
      ID,
    );
    const page = await repository.list({ limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items.map((c) => c.id)).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  it('lets only students enrolled in a course using the exercise play it', async () => {
    await create();
    t.addUser('ana');
    t.addUser('bo');
    t.all(`insert into courses (id, title, slug) values ('c1', 'C', 'c') returning id`);
    t.all(
      `insert into course_sections (id, course_id, title) values ('s1', 'c1', 'S') returning id`,
    );
    t.all(
      `insert into lessons (id, section_id, title, h5p_content_id) values ('l1', 's1', 'L', ?) returning id`,
      ID,
    );
    t.all(`insert into enrollments (user_id, course_id) values ('ana', 'c1') returning user_id`);

    expect(await repository.isPlayableBy(ID, 'ana')).toBe(true);
    expect(await repository.isPlayableBy(ID, 'bo')).toBe(false);
  });
});
