/**
 * The bridge: the HTTP face of the Cloudflare bindings the API cannot use
 * directly, because it runs in a container (or, locally, in a Node process)
 * and bindings only exist inside a Worker.
 *
 *   POST /d1/query   { sql, params? }                 -> { results, meta }
 *   POST /d1/batch   { statements: [{ sql, params? }] } -> { results: [{ results, meta }] }
 *
 * A batch is D1's only transaction: all statements commit or none do.
 *
 * This module does no authentication. Its two callers decide who may reach it:
 * the container intercept (only the container can) and the local-mode route
 * (shared secret). See index.ts.
 */

export const BRIDGE_HOST = 'gateway.internal';

type Param = string | number | boolean | null;

interface Statement {
  sql: string;
  params: Param[];
}

class BadRequest extends Error {}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function parseStatement(value: unknown): Statement {
  if (typeof value !== 'object' || value === null) {
    throw new BadRequest('A statement must be an object.');
  }
  const { sql, params = [] } = value as { sql?: unknown; params?: unknown };
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new BadRequest('`sql` must be a non-empty string.');
  }
  if (!Array.isArray(params)) {
    throw new BadRequest('`params` must be an array.');
  }
  for (const param of params) {
    const kind = typeof param;
    if (param !== null && kind !== 'string' && kind !== 'number' && kind !== 'boolean') {
      throw new BadRequest('`params` may only hold strings, numbers, booleans and null.');
    }
  }
  return { sql, params: params as Param[] };
}

function prepare(db: D1Database, statement: Statement): D1PreparedStatement {
  // D1 stores booleans as integers and rejects the JS type.
  const params = statement.params.map((p) => (typeof p === 'boolean' ? Number(p) : p));
  return db.prepare(statement.sql).bind(...params);
}

function shape(result: D1Result): { results: unknown[]; meta: Record<string, unknown> } {
  return {
    results: result.results,
    meta: {
      changes: result.meta.changes,
      last_row_id: result.meta.last_row_id,
      rows_read: result.meta.rows_read,
      rows_written: result.meta.rows_written,
      duration: result.meta.duration,
    },
  };
}

/**
 * `pathname` is the path below the bridge root, e.g. `/d1/query`.
 */
export async function handleBridge(
  request: Request,
  pathname: string,
  db: D1Database,
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: { message: 'The bridge only accepts POST.' } }, 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: 'The request body must be JSON.' } }, 400);
  }

  try {
    if (pathname === '/d1/query') {
      const result = await prepare(db, parseStatement(body)).all();
      return json(shape(result));
    }

    if (pathname === '/d1/batch') {
      const statements = (body as { statements?: unknown } | null)?.statements;
      if (!Array.isArray(statements) || statements.length === 0) {
        throw new BadRequest('`statements` must be a non-empty array.');
      }
      const prepared = statements.map((s) => prepare(db, parseStatement(s)));
      const results = await db.batch(prepared);
      return json({ results: results.map(shape) });
    }
  } catch (error) {
    if (error instanceof BadRequest) {
      return json({ error: { message: error.message } }, 400);
    }
    // A SQL error (syntax, constraint violation...). The message is what the
    // API maps to its own errors, e.g. "UNIQUE constraint failed: ...".
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: { message, kind: 'sql' } }, 422);
  }

  return json({ error: { message: `Unknown bridge route ${pathname}.` } }, 404);
}
