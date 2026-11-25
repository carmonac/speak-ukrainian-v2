import { beforeEach, describe, expect, it } from 'vitest';
import { handleBridge } from './bridge';

interface Stored {
  body: Uint8Array;
  contentType?: string;
  cacheControl?: string;
}

async function bytesOf(body: ReadableStream | ArrayBuffer | string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/** The slice of R2Bucket the bridge uses, over a map. */
function fakeBucket() {
  const objects = new Map<string, Stored>();
  const uploads = new Map<string, { key: string; parts: Map<number, Uint8Array>; meta: Stored }>();
  const deleteCalls: string[][] = [];
  const uploaded = new Date('2026-05-01T00:00:00.000Z');

  const describeObject = (key: string, stored: Stored) => ({
    key,
    size: stored.body.byteLength,
    uploaded,
    httpEtag: '"etag"',
    writeHttpMetadata(headers: Headers) {
      if (stored.contentType) headers.set('content-type', stored.contentType);
      if (stored.cacheControl) headers.set('cache-control', stored.cacheControl);
    },
  });

  const resume = (key: string, uploadId: string) => ({
    uploadId,
    async uploadPart(partNumber: number, body: ReadableStream) {
      const upload = uploads.get(uploadId);
      if (!upload || upload.key !== key) throw new Error('NoSuchUpload');
      upload.parts.set(partNumber, await bytesOf(body));
      return { partNumber, etag: `etag-${partNumber}` };
    },
    async complete(parts: { partNumber: number; etag: string }[]) {
      const upload = uploads.get(uploadId);
      if (!upload) throw new Error('NoSuchUpload');
      const chunks = parts.map((p) => upload.parts.get(p.partNumber)!);
      const body = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      objects.set(key, { ...upload.meta, body });
      uploads.delete(uploadId);
    },
    async abort() {
      uploads.delete(uploadId);
    },
  });

  const bucket = {
    async put(key: string, body: ReadableStream, options: { httpMetadata?: Omit<Stored, 'body'> }) {
      objects.set(key, { body: await bytesOf(body), ...options.httpMetadata });
    },
    async head(key: string) {
      const stored = objects.get(key);
      return stored ? describeObject(key, stored) : null;
    },
    async get(key: string, options: { range?: Headers }) {
      const stored = objects.get(key);
      if (!stored) return null;
      const header = options.range?.get('range');
      const match = header ? /^bytes=(\d+)-(\d*)$/.exec(header) : null;
      const offset = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) + 1 : stored.body.byteLength;
      if (offset >= stored.body.byteLength) throw new Error('InvalidRange');
      const slice = stored.body.subarray(offset, end);
      return {
        ...describeObject(key, stored),
        body: new Response(slice).body,
        range: match ? { offset, length: slice.byteLength } : undefined,
      };
    },
    async list(options: { prefix: string; delimiter?: string; cursor?: string; limit: number }) {
      const keys = [...objects.keys()].filter((k) => k.startsWith(options.prefix)).sort();
      const found: string[] = [];
      const prefixes = new Set<string>();
      for (const key of keys) {
        const rest = key.slice(options.prefix.length);
        const cut = options.delimiter ? rest.indexOf(options.delimiter) : -1;
        if (cut >= 0) prefixes.add(options.prefix + rest.slice(0, cut + 1));
        else found.push(key);
      }
      const start = Number(options.cursor ?? 0);
      const page = found.slice(start, start + options.limit);
      const truncated = start + options.limit < found.length;
      return {
        objects: page.map((key) => describeObject(key, objects.get(key)!)),
        delimitedPrefixes: start === 0 ? [...prefixes] : [],
        truncated,
        cursor: truncated ? String(start + options.limit) : undefined,
      };
    },
    async delete(keys: string[]) {
      deleteCalls.push(keys);
      for (const key of keys) objects.delete(key);
    },
    async createMultipartUpload(key: string, options: { httpMetadata?: Omit<Stored, 'body'> }) {
      const uploadId = `upload-${uploads.size + 1}`;
      uploads.set(uploadId, {
        key,
        parts: new Map(),
        meta: { body: new Uint8Array(), ...options.httpMetadata },
      });
      return resume(key, uploadId);
    },
    resumeMultipartUpload: resume,
  };

  return { files: bucket as unknown as R2Bucket, objects, uploads, deleteCalls };
}

const NO_DB = {} as D1Database;
const text = (stored: Stored | undefined) => new TextDecoder().decode(stored?.body);

const NO_EMAIL = {} as SendEmail;

describe('bridge: R2', () => {
  let bucket: ReturnType<typeof fakeBucket>;

  function call(
    method: string,
    path: string,
    init: { query?: Record<string, string>; body?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = new URL(`http://gateway.internal${path}`);
    for (const [name, value] of Object.entries(init.query ?? {})) url.searchParams.set(name, value);
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-length')) {
      headers.set('content-length', String(new TextEncoder().encode(init.body).byteLength));
    }
    return handleBridge(new Request(url, { method, headers, body: init.body }), path, {
      db: NO_DB,
      files: bucket.files,
      email: NO_EMAIL,
    });
  }

  beforeEach(() => {
    bucket = fakeBucket();
  });

  it('stores an object with its content type and cache control', async () => {
    const response = await call('PUT', '/r2/object', {
      query: { key: 'h5p/content/a/h5p.json' },
      body: '{"a":1}',
      headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=60' },
    });
    expect(response.status).toBe(204);
    expect(bucket.objects.get('h5p/content/a/h5p.json')).toMatchObject({
      contentType: 'application/json',
      cacheControl: 'private, max-age=60',
    });
    expect(text(bucket.objects.get('h5p/content/a/h5p.json'))).toBe('{"a":1}');
  });

  it('keeps keys with spaces, slashes and unicode intact', async () => {
    const key = 'h5p/content/a/images/фото 1 (копія).png';
    await call('PUT', '/r2/object', { query: { key }, body: 'x' });
    expect([...bucket.objects.keys()]).toEqual([key]);
    expect((await call('GET', '/r2/stat', { query: { key } })).status).toBe(200);
  });

  it('refuses a put without a length or without a key', async () => {
    const noLength = await handleBridge(
      new Request('http://gateway.internal/r2/object?key=a', { method: 'PUT' }),
      '/r2/object',
      { db: NO_DB, files: bucket.files, email: NO_EMAIL },
    );
    expect(noLength.status).toBe(400);
    expect((await call('PUT', '/r2/object', { body: 'x' })).status).toBe(400);
    expect(bucket.objects.size).toBe(0);
  });

  it('returns a whole object with its length and metadata', async () => {
    await call('PUT', '/r2/object', {
      query: { key: 'a.txt' },
      body: '0123456789',
      headers: { 'content-type': 'text/plain' },
    });
    const response = await call('GET', '/r2/object', { query: { key: 'a.txt' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await response.text()).toBe('0123456789');
  });

  it('returns a byte range as 206 with Content-Range', async () => {
    await call('PUT', '/r2/object', { query: { key: 'a.txt' }, body: '0123456789' });

    const middle = await call('GET', '/r2/object', {
      query: { key: 'a.txt' },
      headers: { range: 'bytes=2-5' },
    });
    expect(middle.status).toBe(206);
    expect(middle.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(middle.headers.get('content-length')).toBe('4');
    expect(await middle.text()).toBe('2345');

    const tail = await call('GET', '/r2/object', {
      query: { key: 'a.txt' },
      headers: { range: 'bytes=7-' },
    });
    expect(tail.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(await tail.text()).toBe('789');
  });

  it('answers 404 for a missing object and 416 for a range outside it', async () => {
    expect((await call('GET', '/r2/object', { query: { key: 'nope' } })).status).toBe(404);
    expect((await call('GET', '/r2/stat', { query: { key: 'nope' } })).status).toBe(404);

    await call('PUT', '/r2/object', { query: { key: 'a.txt' }, body: 'abc' });
    const outside = await call('GET', '/r2/object', {
      query: { key: 'a.txt' },
      headers: { range: 'bytes=10-20' },
    });
    expect(outside.status).toBe(416);
  });

  it('reports size and upload time', async () => {
    await call('PUT', '/r2/object', { query: { key: 'a.txt' }, body: 'abcd' });
    const response = await call('GET', '/r2/stat', { query: { key: 'a.txt' } });
    expect(await response.json()).toEqual({
      key: 'a.txt',
      size: 4,
      uploaded: '2026-05-01T00:00:00.000Z',
    });
  });

  it('lists a prefix page by page', async () => {
    for (const name of ['a', 'b', 'c']) {
      await call('PUT', '/r2/object', { query: { key: `p/${name}` }, body: name });
    }
    await call('PUT', '/r2/object', { query: { key: 'other/x' }, body: 'x' });

    const first = (await (
      await call('GET', '/r2/list', { query: { prefix: 'p/', limit: '2' } })
    ).json()) as { objects: { key: string }[]; prefixes: string[]; cursor?: string };
    expect(first.objects.map((o) => o.key)).toEqual(['p/a', 'p/b']);
    expect(first.cursor).toBeDefined();

    const second = (await (
      await call('GET', '/r2/list', { query: { prefix: 'p/', limit: '2', cursor: first.cursor! } })
    ).json()) as { objects: { key: string; size: number }[]; cursor?: string };
    expect(second.objects).toEqual([{ key: 'p/c', size: 1, uploaded: '2026-05-01T00:00:00.000Z' }]);
    expect(second.cursor).toBeUndefined();
  });

  it('lists immediate subdirectories with a delimiter', async () => {
    await call('PUT', '/r2/object', { query: { key: 'libs/A-1.0/library.json' }, body: 'x' });
    await call('PUT', '/r2/object', { query: { key: 'libs/A-1.0/js/a.js' }, body: 'x' });
    await call('PUT', '/r2/object', { query: { key: 'libs/B-2.1/library.json' }, body: 'x' });

    const page = (await (
      await call('GET', '/r2/list', { query: { prefix: 'libs/', delimiter: '/' } })
    ).json()) as { objects: unknown[]; prefixes: string[] };
    expect(page.objects).toEqual([]);
    expect(page.prefixes).toEqual(['libs/A-1.0/', 'libs/B-2.1/']);
  });

  it('rejects a list limit outside 1..1000', async () => {
    expect((await call('GET', '/r2/list', { query: { limit: '0' } })).status).toBe(400);
    expect((await call('GET', '/r2/list', { query: { limit: '1001' } })).status).toBe(400);
  });

  it('deletes a batch of keys, and nothing for an empty batch', async () => {
    await call('PUT', '/r2/object', { query: { key: 'a' }, body: 'x' });
    await call('PUT', '/r2/object', { query: { key: 'b' }, body: 'x' });
    await call('PUT', '/r2/object', { query: { key: 'c' }, body: 'x' });

    const response = await call('POST', '/r2/delete', {
      body: JSON.stringify({ keys: ['a', 'c', 'gone'] }),
    });
    expect(response.status).toBe(204);
    expect([...bucket.objects.keys()]).toEqual(['b']);

    expect((await call('POST', '/r2/delete', { body: JSON.stringify({ keys: [] }) })).status).toBe(
      204,
    );
    expect(bucket.deleteCalls).toHaveLength(1);
  });

  it('refuses a malformed or oversized delete', async () => {
    expect((await call('POST', '/r2/delete', { body: JSON.stringify({ keys: 'a' }) })).status).toBe(
      400,
    );
    expect(
      (await call('POST', '/r2/delete', { body: JSON.stringify({ keys: [''] }) })).status,
    ).toBe(400);
    const many = Array.from({ length: 1001 }, (_, i) => `k${i}`);
    expect(
      (await call('POST', '/r2/delete', { body: JSON.stringify({ keys: many }) })).status,
    ).toBe(400);
    expect(bucket.deleteCalls).toEqual([]);
  });

  it('assembles a multipart upload from its parts, in the order given', async () => {
    const created = await call('POST', '/r2/multipart', {
      query: { key: 'big.bin' },
      headers: { 'content-type': 'video/mp4' },
    });
    const { uploadId } = (await created.json()) as { uploadId: string };

    const parts = [];
    for (const [index, body] of ['AAAA', 'BBBB', 'CC'].entries()) {
      const response = await call('PUT', '/r2/multipart/part', {
        query: { key: 'big.bin', uploadId, partNumber: String(index + 1) },
        body,
      });
      expect(response.status).toBe(200);
      parts.push(await response.json());
    }
    expect(bucket.objects.has('big.bin')).toBe(false);

    const completed = await call('POST', '/r2/multipart/complete', {
      query: { key: 'big.bin', uploadId },
      body: JSON.stringify({ parts }),
    });
    expect(completed.status).toBe(204);
    expect(text(bucket.objects.get('big.bin'))).toBe('AAAABBBBCC');
    expect(bucket.objects.get('big.bin')?.contentType).toBe('video/mp4');
  });

  it('aborts a multipart upload, leaving no object', async () => {
    const created = await call('POST', '/r2/multipart', { query: { key: 'big.bin' } });
    const { uploadId } = (await created.json()) as { uploadId: string };
    await call('PUT', '/r2/multipart/part', {
      query: { key: 'big.bin', uploadId, partNumber: '1' },
      body: 'AAAA',
    });

    const aborted = await call('DELETE', '/r2/multipart', { query: { key: 'big.bin', uploadId } });
    expect(aborted.status).toBe(204);
    expect(bucket.uploads.size).toBe(0);
    expect(bucket.objects.size).toBe(0);
  });

  it('refuses a part without a valid number and a completion without parts', async () => {
    expect(
      (
        await call('PUT', '/r2/multipart/part', {
          query: { key: 'k', uploadId: 'u', partNumber: '0' },
          body: 'x',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/r2/multipart/complete', {
          query: { key: 'k', uploadId: 'u' },
          body: JSON.stringify({ parts: [] }),
        })
      ).status,
    ).toBe(400);
  });

  it('answers 404 for a route that does not exist', async () => {
    expect((await call('DELETE', '/r2/object', { query: { key: 'a' } })).status).toBe(404);
    expect((await call('GET', '/r2/nope')).status).toBe(404);
  });
});
