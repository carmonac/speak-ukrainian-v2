import { describe, expect, it } from 'vitest';
import { handleBridge } from './bridge';

interface Call {
  sql: string;
  params: unknown[];
}

const META = { changes: 1, last_row_id: 7, rows_read: 2, rows_written: 1, duration: 0.5 };

/** The slice of D1Database the bridge uses. */
function fakeDb(options: { fail?: string } = {}) {
  const calls: Call[] = [];
  let batches = 0;
  const run = (call: Call) => {
    if (options.fail) throw new Error(options.fail);
    calls.push(call);
    return { results: [{ sql: call.sql }], meta: META, success: true };
  };
  const db = {
    prepare(sql: string) {
      const call: Call = { sql, params: [] };
      const statement = {
        call,
        bind(...params: unknown[]) {
          call.params = params;
          return statement;
        },
        all: async () => run(call),
      };
      return statement;
    },
    async batch(statements: { call: Call }[]) {
      batches++;
      return statements.map((s) => run(s.call));
    },
  };
  return { db: db as unknown as D1Database, calls, batches: () => batches };
}

/** The D1 routes never touch the bucket. */
const NO_FILES = {} as R2Bucket;

function post(body: unknown): Request {
  return new Request('http://gateway.internal/', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('handleBridge', () => {
  it('runs a query with its parameters and returns rows and meta', async () => {
    const { db, calls } = fakeDb();
    const response = await handleBridge(
      post({ sql: 'select * from pages where id = ?', params: ['p1'] }),
      '/d1/query',
      { db, files: NO_FILES },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ sql: 'select * from pages where id = ?' }],
      meta: META,
    });
    expect(calls).toEqual([{ sql: 'select * from pages where id = ?', params: ['p1'] }]);
  });

  it('binds booleans as integers', async () => {
    const { db, calls } = fakeDb();
    await handleBridge(post({ sql: 'select ?, ?', params: [true, false] }), '/d1/query', {
      db,
      files: NO_FILES,
    });
    expect(calls[0]?.params).toEqual([1, 0]);
  });

  it('runs a batch as one D1 batch, in order', async () => {
    const { db, calls, batches } = fakeDb();
    const response = await handleBridge(
      post({
        statements: [{ sql: 'delete from a' }, { sql: 'insert into a values (?)', params: [1] }],
      }),
      '/d1/batch',
      { db, files: NO_FILES },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(2);
    expect(batches()).toBe(1);
    expect(calls.map((c) => c.sql)).toEqual(['delete from a', 'insert into a values (?)']);
  });

  it('reports a SQL failure as 422 with the database message', async () => {
    const { db } = fakeDb({ fail: 'UNIQUE constraint failed: pages.slug' });
    const response = await handleBridge(post({ sql: 'insert into pages' }), '/d1/query', {
      db,
      files: NO_FILES,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { message: 'UNIQUE constraint failed: pages.slug', kind: 'sql' },
    });
  });

  it.each([
    ['a missing sql', { params: [] }, '/d1/query'],
    ['params that are not an array', { sql: 'select 1', params: 'x' }, '/d1/query'],
    ['an object parameter', { sql: 'select ?', params: [{}] }, '/d1/query'],
    ['an empty batch', { statements: [] }, '/d1/batch'],
  ])('rejects %s with 400 and runs nothing', async (_name, body, path) => {
    const { db, calls } = fakeDb();
    const response = await handleBridge(post(body), path, { db, files: NO_FILES });
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await handleBridge(post('not json'), '/d1/query', {
      db: fakeDb().db,
      files: NO_FILES,
    });
    expect(response.status).toBe(400);
  });

  it('rejects other methods and unknown routes', async () => {
    const { db } = fakeDb();
    const get = new Request('http://gateway.internal/d1/query');
    expect((await handleBridge(get, '/d1/query', { db, files: NO_FILES })).status).toBe(404);
    expect(
      (await handleBridge(post({ sql: 'select 1' }), '/d1/exec', { db, files: NO_FILES })).status,
    ).toBe(404);
  });
});
