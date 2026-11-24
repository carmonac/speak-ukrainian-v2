/**
 * The bridge: the HTTP face of the Cloudflare bindings the API cannot use
 * directly, because it runs in a container (or, locally, in a Node process)
 * and bindings only exist inside a Worker.
 *
 * Database (D1):
 *   POST   /d1/query   { sql, params? }                   -> { results, meta }
 *   POST   /d1/batch   { statements: [{ sql, params? }] } -> { results: [{ results, meta }] }
 *   A batch is D1's only transaction: all statements commit or none do.
 *
 * Files (R2). The object key always travels as the `key` query parameter:
 *   PUT    /r2/object?key=            body, Content-Length required -> 204
 *   GET    /r2/object?key=            optional Range                -> 200 | 206 | 404
 *   GET    /r2/stat?key=                                            -> { size, uploaded } | 404
 *   GET    /r2/list?prefix=&delimiter=&cursor=&limit=               -> { objects, prefixes, cursor? }
 *   POST   /r2/delete  { keys: [...] }  (at most 1000)              -> 204
 *   POST   /r2/multipart?key=                                       -> { uploadId }
 *   PUT    /r2/multipart/part?key=&uploadId=&partNumber=   body     -> { partNumber, etag }
 *   POST   /r2/multipart/complete?key=&uploadId=  { parts }         -> 204
 *   DELETE /r2/multipart?key=&uploadId=                             -> 204
 *
 * This module does no authentication. Its two callers decide who may reach it:
 * the container intercept (only the container can) and the local-mode route
 * (shared secret). See index.ts.
 */

export const BRIDGE_HOST = 'gateway.internal';

/** The bindings the bridge exposes. */
export interface BridgeBindings {
  db: D1Database;
  files: R2Bucket;
}

/** R2 deletes at most this many keys per call. */
const MAX_DELETE_KEYS = 1000;

type Param = string | number | boolean | null;

interface Statement {
  sql: string;
  params: Param[];
}

class BadRequest extends Error {}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function fail(message: string, status: number, kind?: string): Response {
  return json({ error: { message, ...(kind ? { kind } : {}) } }, status);
}

const noContent = (): Response => new Response(null, { status: 204 });

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequest('The request body must be JSON.');
  }
}

// --- D1 ----------------------------------------------------------------------

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

async function handleD1(request: Request, route: string, db: D1Database): Promise<Response | null> {
  if (route !== 'POST /d1/query' && route !== 'POST /d1/batch') {
    return null;
  }
  const body = await jsonBody(request);
  try {
    if (route === 'POST /d1/query') {
      return json(shape(await prepare(db, parseStatement(body)).all()));
    }
    const statements = (body as { statements?: unknown } | null)?.statements;
    if (!Array.isArray(statements) || statements.length === 0) {
      throw new BadRequest('`statements` must be a non-empty array.');
    }
    const results = await db.batch(statements.map((s) => prepare(db, parseStatement(s))));
    return json({ results: results.map(shape) });
  } catch (error) {
    if (error instanceof BadRequest) {
      throw error;
    }
    // A SQL error (syntax, constraint violation...). The message is what the
    // API maps to its own errors, e.g. "UNIQUE constraint failed: ...".
    return fail(error instanceof Error ? error.message : String(error), 422, 'sql');
  }
}

// --- R2 ----------------------------------------------------------------------

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (value === null || value === '') {
    throw new BadRequest(`The \`${name}\` query parameter is required.`);
  }
  return value;
}

/** A body R2 can store: it needs to know the length before reading it. */
function sizedBody(request: Request): ReadableStream {
  const length = request.headers.get('content-length');
  if (!request.body || length === null) {
    throw new BadRequest('A body with a Content-Length is required.');
  }
  return request.body;
}

function httpMetadata(request: Request): R2HTTPMetadata {
  const contentType = request.headers.get('content-type');
  const cacheControl = request.headers.get('cache-control');
  return {
    ...(contentType ? { contentType } : {}),
    ...(cacheControl ? { cacheControl } : {}),
  };
}

function stat(object: R2Object): { key: string; size: number; uploaded: string } {
  return { key: object.key, size: object.size, uploaded: object.uploaded.toISOString() };
}

async function getObject(request: Request, files: R2Bucket, key: string): Promise<Response> {
  let object: R2ObjectBody | null;
  try {
    // R2 reads the Range header itself: offsets, open ends and suffixes.
    object = await files.get(key, { range: request.headers });
  } catch (error) {
    // A range outside the object.
    return fail(error instanceof Error ? error.message : String(error), 416);
  }
  if (!object) {
    return fail(`No object at ${key}.`, 404);
  }

  const headers = new Headers({ 'accept-ranges': 'bytes', etag: object.httpEtag });
  object.writeHttpMetadata(headers);

  const range = object.range as { offset?: number; length?: number } | undefined;
  const partial = request.headers.has('range') && range !== undefined;
  if (partial) {
    const offset = range.offset ?? 0;
    const length = range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
  } else {
    headers.set('content-length', String(object.size));
  }
  return new Response(object.body, { status: partial ? 206 : 200, headers });
}

async function handleR2(
  request: Request,
  route: string,
  url: URL,
  files: R2Bucket,
): Promise<Response | null> {
  switch (route) {
    case 'PUT /r2/object': {
      await files.put(required(url, 'key'), sizedBody(request), {
        httpMetadata: httpMetadata(request),
      });
      return noContent();
    }

    case 'GET /r2/object':
      return getObject(request, files, required(url, 'key'));

    case 'GET /r2/stat': {
      const key = required(url, 'key');
      const object = await files.head(key);
      return object ? json(stat(object)) : fail(`No object at ${key}.`, 404);
    }

    case 'GET /r2/list': {
      const delimiter = url.searchParams.get('delimiter');
      const cursor = url.searchParams.get('cursor');
      const limit = Number(url.searchParams.get('limit') ?? '1000');
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        throw new BadRequest('`limit` must be between 1 and 1000.');
      }
      const page = await files.list({
        prefix: url.searchParams.get('prefix') ?? '',
        limit,
        ...(delimiter ? { delimiter } : {}),
        ...(cursor ? { cursor } : {}),
      });
      return json({
        objects: page.objects.map(stat),
        prefixes: page.delimitedPrefixes,
        ...(page.truncated ? { cursor: page.cursor } : {}),
      });
    }

    case 'POST /r2/delete': {
      const keys = ((await jsonBody(request)) as { keys?: unknown } | null)?.keys;
      if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' || key === '')) {
        throw new BadRequest('`keys` must be an array of non-empty strings.');
      }
      if (keys.length > MAX_DELETE_KEYS) {
        throw new BadRequest(`At most ${MAX_DELETE_KEYS} keys can be deleted at once.`);
      }
      if (keys.length > 0) {
        await files.delete(keys as string[]);
      }
      return noContent();
    }

    case 'POST /r2/multipart': {
      const upload = await files.createMultipartUpload(required(url, 'key'), {
        httpMetadata: httpMetadata(request),
      });
      return json({ uploadId: upload.uploadId });
    }

    case 'PUT /r2/multipart/part': {
      const partNumber = Number(required(url, 'partNumber'));
      if (!Number.isInteger(partNumber) || partNumber < 1) {
        throw new BadRequest('`partNumber` must be a positive integer.');
      }
      const upload = files.resumeMultipartUpload(required(url, 'key'), required(url, 'uploadId'));
      const part = await upload.uploadPart(partNumber, sizedBody(request));
      return json({ partNumber: part.partNumber, etag: part.etag });
    }

    case 'POST /r2/multipart/complete': {
      const parts = ((await jsonBody(request)) as { parts?: unknown } | null)?.parts;
      if (
        !Array.isArray(parts) ||
        parts.length === 0 ||
        parts.some(
          (p: { partNumber?: unknown; etag?: unknown } | null) =>
            typeof p?.partNumber !== 'number' || typeof p.etag !== 'string',
        )
      ) {
        throw new BadRequest('`parts` must be a non-empty array of { partNumber, etag }.');
      }
      const upload = files.resumeMultipartUpload(required(url, 'key'), required(url, 'uploadId'));
      await upload.complete(parts as R2UploadedPart[]);
      return noContent();
    }

    case 'DELETE /r2/multipart': {
      const upload = files.resumeMultipartUpload(required(url, 'key'), required(url, 'uploadId'));
      await upload.abort();
      return noContent();
    }

    default:
      return null;
  }
}

// --- entry -------------------------------------------------------------------

/**
 * `pathname` is the path below the bridge root, e.g. `/d1/query`. The query
 * string is read from `request.url`.
 */
export async function handleBridge(
  request: Request,
  pathname: string,
  bindings: BridgeBindings,
): Promise<Response> {
  const route = `${request.method} ${pathname}`;
  try {
    const response =
      (await handleD1(request, route, bindings.db)) ??
      (await handleR2(request, route, new URL(request.url), bindings.files));
    return response ?? fail(`Unknown bridge route ${route}.`, 404);
  } catch (error) {
    if (error instanceof BadRequest) {
      return fail(error.message, 400);
    }
    console.error(`Bridge ${route} failed`, error);
    return fail(error instanceof Error ? error.message : String(error), 500);
  }
}
