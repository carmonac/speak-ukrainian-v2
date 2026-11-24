import { Readable } from 'node:stream';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/configuration.js';
import { BridgeClient } from '../bridge/bridge.client.js';
import { BridgeObjectStore } from './bridge.object-store.js';
import type {
  ObjectInfo,
  ObjectMetadata,
  ObjectPage,
  ObjectStoreDriver,
  UploadedPart,
} from './object-store.js';
import { StorageService, UPLOAD_PART_BYTES } from './storage.service.js';

/**
 * An object store holding objects in a map, with real pagination (two keys
 * per page) so the paging loops are exercised, and a record of every call.
 */
class FakeStore implements ObjectStoreDriver {
  readonly objects = new Map<string, { body: Buffer; metadata: ObjectMetadata }>();
  readonly uploads = new Map<string, { key: string; metadata: ObjectMetadata; parts: Buffer[] }>();
  readonly calls: string[] = [];
  readonly partSizes: number[] = [];
  readonly deleteBatches: string[][] = [];
  pageSize = 2;
  failDeleteOf: string | null = null;
  failPart: number | null = null;

  async put(key: string, body: Buffer, metadata: ObjectMetadata): Promise<void> {
    this.calls.push('put');
    this.objects.set(key, { body, metadata });
  }

  async head(key: string): Promise<ObjectInfo | null> {
    this.calls.push('head');
    if (key === 'boom') {
      throw new Error('store unavailable');
    }
    const found = this.objects.get(key);
    return found ? { key, sizeBytes: found.body.length, uploadedAt: new Date(1_000) } : null;
  }

  async get(key: string, range?: { start?: number; end?: number }): Promise<Readable | null> {
    this.calls.push('get');
    const found = this.objects.get(key);
    if (!found) {
      return null;
    }
    const slice = range
      ? found.body.subarray(range.start ?? 0, range.end === undefined ? undefined : range.end + 1)
      : found.body;
    return Readable.from([slice]);
  }

  async list(query: {
    prefix: string;
    delimiter?: string;
    cursor?: string;
    limit: number;
  }): Promise<ObjectPage> {
    this.calls.push('list');
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(query.prefix)).sort();
    const entries: ({ key: string } | { prefix: string })[] = [];
    const seen = new Set<string>();
    for (const key of keys) {
      const rest = key.slice(query.prefix.length);
      const cut = query.delimiter ? rest.indexOf(query.delimiter) : -1;
      if (cut < 0) {
        entries.push({ key });
      } else {
        const prefix = query.prefix + rest.slice(0, cut + 1);
        if (!seen.has(prefix)) {
          seen.add(prefix);
          entries.push({ prefix });
        }
      }
    }

    const start = Number(query.cursor ?? 0);
    const page = entries.slice(start, start + this.pageSize);
    const next = start + this.pageSize;
    return {
      objects: page
        .filter((e): e is { key: string } => 'key' in e)
        .map((e) => ({
          key: e.key,
          sizeBytes: this.objects.get(e.key)!.body.length,
          uploadedAt: new Date(1_000),
        })),
      prefixes: page.filter((e): e is { prefix: string } => 'prefix' in e).map((e) => e.prefix),
      ...(next < entries.length ? { cursor: String(next) } : {}),
    };
  }

  async deleteMany(keys: string[]): Promise<void> {
    this.calls.push('deleteMany');
    this.deleteBatches.push(keys);
    if (this.failDeleteOf !== null && keys.includes(this.failDeleteOf)) {
      throw new Error('AccessDenied');
    }
    for (const key of keys) {
      this.objects.delete(key);
    }
  }

  async createMultipart(key: string, metadata: ObjectMetadata): Promise<string> {
    this.calls.push('createMultipart');
    const uploadId = `upload-${this.uploads.size + 1}`;
    this.uploads.set(uploadId, { key, metadata, parts: [] });
    return uploadId;
  }

  async uploadPart(
    _key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<UploadedPart> {
    this.calls.push('uploadPart');
    if (partNumber === this.failPart) {
      throw new Error('part refused');
    }
    this.partSizes.push(body.length);
    this.uploads.get(uploadId)!.parts[partNumber - 1] = body;
    return { partNumber, etag: `etag-${partNumber}` };
  }

  async completeMultipart(key: string, uploadId: string, parts: UploadedPart[]): Promise<void> {
    this.calls.push('completeMultipart');
    const upload = this.uploads.get(uploadId)!;
    this.objects.set(key, {
      body: Buffer.concat(parts.map((p) => upload.parts[p.partNumber - 1]!)),
      metadata: upload.metadata,
    });
    this.uploads.delete(uploadId);
  }

  async abortMultipart(_key: string, uploadId: string): Promise<void> {
    this.calls.push('abortMultipart');
    this.uploads.delete(uploadId);
  }
}

function harness(): { service: StorageService; store: FakeStore } {
  const store = new FakeStore();
  return { service: new StorageService(store), store };
}

async function text(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** A stream of `total` bytes delivered in chunks of `chunk` bytes. */
function streamOf(total: number, chunk: number): Readable {
  let sent = 0;
  return new Readable({
    read() {
      if (sent >= total) {
        this.push(null);
        return;
      }
      const size = Math.min(chunk, total - sent);
      this.push(Buffer.alloc(size, sent % 251));
      sent += size;
    },
  });
}

describe('StorageService', () => {
  it('puts a buffer with its content type and cache control', async () => {
    const { service, store } = harness();
    await service.put('h5p/content/a/h5p.json', Buffer.from('{}'), {
      contentType: 'application/json',
      cacheControl: 'private',
    });
    expect(store.objects.get('h5p/content/a/h5p.json')).toEqual({
      body: Buffer.from('{}'),
      metadata: { contentType: 'application/json', cacheControl: 'private' },
    });
    expect(store.calls).toEqual(['put']);
  });

  describe('streams', () => {
    it('stores a stream that fits in one part with a single put', async () => {
      const { service, store } = harness();
      await service.put('small.bin', Readable.from([Buffer.from('ab'), Buffer.from('cd')]), {
        contentType: 'text/plain',
      });
      expect(store.objects.get('small.bin')?.body.toString()).toBe('abcd');
      expect(store.objects.get('small.bin')?.metadata).toEqual({ contentType: 'text/plain' });
      expect(store.calls).toEqual(['put']);
    });

    it('stores an empty stream as an empty object', async () => {
      const { service, store } = harness();
      await service.put('empty.bin', Readable.from([]));
      expect(store.objects.get('empty.bin')?.body.length).toBe(0);
      expect(store.calls).toEqual(['put']);
    });

    it('stores a stream of exactly one part with a single put', async () => {
      const { service, store } = harness();
      await service.put('exact.bin', streamOf(UPLOAD_PART_BYTES, 1024 * 1024));
      expect(store.objects.get('exact.bin')?.body.length).toBe(UPLOAD_PART_BYTES);
      expect(store.calls).toEqual(['put']);
    });

    it('cuts a longer stream into equal parts and a remainder, whatever the chunking', async () => {
      const { service, store } = harness();
      const total = 2 * UPLOAD_PART_BYTES + 12_345;
      // Chunks that do not divide a part, so part boundaries fall inside chunks.
      const source = streamOf(total, 700_001);
      const expected = await text(streamOf(total, 700_001));

      await service.put('big.bin', source, { contentType: 'video/mp4' });

      expect(store.partSizes).toEqual([UPLOAD_PART_BYTES, UPLOAD_PART_BYTES, 12_345]);
      expect(store.calls).toEqual([
        'createMultipart',
        'uploadPart',
        'uploadPart',
        'uploadPart',
        'completeMultipart',
      ]);
      const stored = store.objects.get('big.bin')!;
      expect(stored.body.length).toBe(total);
      expect(stored.body.toString('utf8')).toBe(expected);
      expect(stored.metadata).toEqual({ contentType: 'video/mp4' });
    });

    it('ends a stream that is an exact multiple of the part size with a full last part', async () => {
      const { service, store } = harness();
      await service.put('even.bin', streamOf(2 * UPLOAD_PART_BYTES, 3_000_000));
      expect(store.partSizes).toEqual([UPLOAD_PART_BYTES, UPLOAD_PART_BYTES]);
      expect(store.objects.get('even.bin')?.body.length).toBe(2 * UPLOAD_PART_BYTES);
    });

    it('aborts the upload and stores nothing when a part fails', async () => {
      const { service, store } = harness();
      store.failPart = 2;
      await expect(
        service.put('big.bin', streamOf(3 * UPLOAD_PART_BYTES, 1_000_000)),
      ).rejects.toThrow('part refused');
      expect(store.calls.at(-1)).toBe('abortMultipart');
      expect(store.uploads.size).toBe(0);
      expect(store.objects.has('big.bin')).toBe(false);
    });

    it('aborts the upload when the source stream fails part-way', async () => {
      const { service, store } = harness();
      let sent = 0;
      const source = new Readable({
        read() {
          if (sent > UPLOAD_PART_BYTES * 1.5) {
            this.destroy(new Error('upload interrupted'));
            return;
          }
          this.push(Buffer.alloc(1_000_000));
          sent += 1_000_000;
        },
      });
      await expect(service.put('big.bin', source)).rejects.toThrow('upload interrupted');
      expect(store.uploads.size).toBe(0);
      expect(store.objects.size).toBe(0);
    });
  });

  it('reports existence and size, and null for an absent object', async () => {
    const { service } = harness();
    await service.put('a/x.bin', Buffer.from('12345'));

    expect(await service.exists('a/x.bin')).toBe(true);
    expect(await service.exists('a/nope.bin')).toBe(false);
    expect(await service.stat('a/x.bin')).toEqual({ sizeBytes: 5, createdAt: new Date(1_000) });
    expect(await service.stat('a/nope.bin')).toBeNull();
  });

  it('rethrows a stat failure that is not "not found"', async () => {
    const { service } = harness();
    await expect(service.stat('boom')).rejects.toThrow('store unavailable');
  });

  it('deletes an object, and deleting an absent one succeeds', async () => {
    const { service, store } = harness();
    await service.put('a/x.bin', Buffer.from('1'));

    await service.delete('a/x.bin');
    await service.delete('a/x.bin');

    expect(store.objects.size).toBe(0);
  });

  it('lists every object under a prefix across pages, with sizes', async () => {
    const { service, store } = harness();
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await service.put(`p/${name}`, Buffer.from(name.repeat(3)));
    }
    await service.put('other/z', Buffer.from('z'));

    const listed = await service.list('p/');
    expect(listed.map((o) => o.path)).toEqual(['p/a', 'p/b', 'p/c', 'p/d', 'p/e']);
    expect(listed[0]).toEqual({ path: 'p/a', sizeBytes: 3, createdAt: new Date(1_000) });
    expect(store.calls.filter((c) => c === 'list')).toHaveLength(3);
  });

  it('refuses a listing wider than the limit instead of truncating it', async () => {
    const { service } = harness();
    for (const name of ['a', 'b', 'c']) {
      await service.put(`p/${name}`, Buffer.from('1'));
    }
    await expect(service.list('p/', 2)).rejects.toThrow(/more than 2 objects/);
  });

  it('listUpTo truncates deliberately and stops paging once it has enough', async () => {
    const { service, store } = harness();
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      await service.put(`p/${name}`, Buffer.from('1'));
    }
    store.calls.length = 0;

    const listed = await service.listUpTo('p/', 3);
    expect(listed.map((o) => o.path)).toEqual(['p/a', 'p/b', 'p/c']);
    expect(store.calls.filter((c) => c === 'list')).toHaveLength(2);
  });

  it('lists immediate subdirectories without the trailing slash, across pages', async () => {
    const { service } = harness();
    for (const path of [
      'libs/A-1.0/library.json',
      'libs/A-1.0/js/a.js',
      'libs/B-2.1/library.json',
      'libs/C-0.3/library.json',
      'libs/readme.txt',
    ]) {
      await service.put(path, Buffer.from('1'));
    }
    expect(await service.listSubdirectories('libs/')).toEqual(['A-1.0', 'B-2.1', 'C-0.3']);
  });

  it('deletes everything under a prefix and nothing beside it', async () => {
    const { service, store } = harness();
    for (const path of ['c/abc/a', 'c/abc/b/c', 'c/abc/d', 'c/abcdef/a']) {
      await service.put(path, Buffer.from('1'));
    }

    await service.deleteByPrefix('c/abc/');

    expect([...store.objects.keys()]).toEqual(['c/abcdef/a']);
  });

  it('deletes a wide prefix in batches of at most 1000 keys', async () => {
    const { service, store } = harness();
    store.pageSize = 1_000;
    for (let i = 0; i < 2_300; i++) {
      store.objects.set(`wide/${String(i).padStart(5, '0')}`, {
        body: Buffer.alloc(0),
        metadata: {},
      });
    }

    await service.deleteByPrefix('wide/');

    expect(store.deleteBatches.map((batch) => batch.length)).toEqual([1_000, 1_000, 300]);
    expect(store.objects.size).toBe(0);
  });

  it('refuses a delete prefix without a trailing slash', async () => {
    const { service, store } = harness();
    await service.put('c/abc/a', Buffer.from('1'));
    await expect(service.deleteByPrefix('c/abc')).rejects.toThrow(/must end in "\/"/);
    expect(store.objects.size).toBe(1);
  });

  it('fails a prefix delete when the store could not remove the objects', async () => {
    const { service, store } = harness();
    await service.put('c/x/a', Buffer.from('1'));
    store.failDeleteOf = 'c/x/a';
    await expect(service.deleteByPrefix('c/x/')).rejects.toThrow(
      /Could not delete the objects under "c\/x\/": AccessDenied/,
    );
  });

  it('streams a whole object', async () => {
    const { service } = harness();
    await service.put('a.txt', Buffer.from('0123456789'));
    expect(await text(service.createReadStream('a.txt'))).toBe('0123456789');
  });

  it('streams a byte range, both ends inclusive', async () => {
    const { service } = harness();
    await service.put('a.txt', Buffer.from('0123456789'));
    expect(await text(service.createReadStream('a.txt', { start: 2, end: 5 }))).toBe('2345');
  });

  it('streams from an offset to the end when only a start is given', async () => {
    const { service } = harness();
    await service.put('a.txt', Buffer.from('0123456789'));
    expect(await text(service.createReadStream('a.txt', { start: 7 }))).toBe('789');
  });

  it('surfaces a missing object as an error on the stream, not a throw', async () => {
    const { service } = harness();
    const stream = service.createReadStream('nope.txt');
    await expect(text(stream)).rejects.toThrow(/No object at "nope.txt"/);
  });
});

describe('BridgeObjectStore', () => {
  const config = {
    get: (key: string) => (key === 'BRIDGE_URL' ? 'http://gateway.internal' : undefined),
  } as unknown as ConfigService<Env, true>;
  const store = () => new BridgeObjectStore(new BridgeClient(config));

  interface Call {
    method: string;
    url: URL;
    headers: Record<string, string>;
    body: unknown;
  }

  function respond(handler: (call: Call) => Response): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      const call: Call = {
        method: init.method ?? 'GET',
        url,
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body,
      };
      calls.push(call);
      return handler(call);
    });
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('puts bytes at a key that needs encoding, with its metadata', async () => {
    const calls = respond(() => new Response(null, { status: 204 }));
    const key = 'h5p/content/a/images/фото 1.png';
    await store().put(key, Buffer.from('png'), { contentType: 'image/png' });

    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url.pathname).toBe('/r2/object');
    expect(calls[0]!.url.searchParams.get('key')).toBe(key);
    expect(calls[0]!.headers).toMatchObject({ 'content-type': 'image/png' });
    expect(calls[0]!.body).toEqual(Buffer.from('png'));
  });

  it('reads size and date, and null for 404', async () => {
    respond((call) =>
      call.url.searchParams.get('key') === 'a'
        ? Response.json({ key: 'a', size: 12, uploaded: '2026-05-01T00:00:00.000Z' })
        : Response.json({ error: { message: 'No object' } }, { status: 404 }),
    );
    expect(await store().head('a')).toEqual({
      key: 'a',
      sizeBytes: 12,
      uploadedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(await store().head('missing')).toBeNull();
  });

  it('asks for a byte range and streams the answer', async () => {
    const calls = respond(() => new Response('2345', { status: 206 }));
    const stream = await store().get('a.txt', { start: 2, end: 5 });
    expect(await text(stream!)).toBe('2345');
    expect(calls[0]!.headers).toMatchObject({ range: 'bytes=2-5' });

    await store().get('a.txt', { start: 7 });
    expect(calls[1]!.headers).toMatchObject({ range: 'bytes=7-' });

    await store().get('a.txt');
    expect(calls[2]!.headers).not.toHaveProperty('range');
  });

  it('returns null for a missing object and throws for any other failure', async () => {
    respond((call) =>
      call.url.searchParams.get('key') === 'missing'
        ? Response.json({ error: { message: 'No object' } }, { status: 404 })
        : Response.json({ error: { message: 'bucket on fire' } }, { status: 500 }),
    );
    expect(await store().get('missing')).toBeNull();
    await expect(store().get('a')).rejects.toThrow(/bucket on fire/);
    await expect(store().head('a')).rejects.toThrow(/bucket on fire/);
  });

  it('lists a page and passes the cursor on', async () => {
    const calls = respond(() =>
      Response.json({
        objects: [{ key: 'p/a', size: 1, uploaded: '2026-05-01T00:00:00.000Z' }],
        prefixes: ['p/dir/'],
        cursor: 'next',
      }),
    );
    const page = await store().list({ prefix: 'p/', delimiter: '/', cursor: 'c1', limit: 1000 });
    expect(page).toEqual({
      objects: [{ key: 'p/a', sizeBytes: 1, uploadedAt: new Date('2026-05-01T00:00:00.000Z') }],
      prefixes: ['p/dir/'],
      cursor: 'next',
    });
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
      prefix: 'p/',
      delimiter: '/',
      cursor: 'c1',
      limit: '1000',
    });
  });

  it('runs a multipart upload and a batch delete', async () => {
    const calls = respond((call) => {
      if (call.method === 'POST' && call.url.pathname === '/r2/multipart') {
        return Response.json({ uploadId: 'u1' });
      }
      if (call.url.pathname === '/r2/multipart/part') {
        return Response.json({ partNumber: 1, etag: 'e1' });
      }
      return new Response(null, { status: 204 });
    });
    const s = store();

    expect(await s.createMultipart('big', { contentType: 'video/mp4' })).toBe('u1');
    expect(await s.uploadPart('big', 'u1', 1, Buffer.from('x'))).toEqual({
      partNumber: 1,
      etag: 'e1',
    });
    await s.completeMultipart('big', 'u1', [{ partNumber: 1, etag: 'e1' }]);
    await s.abortMultipart('big', 'u1');
    await s.deleteMany(['a', 'b']);

    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      'POST /r2/multipart',
      'PUT /r2/multipart/part',
      'POST /r2/multipart/complete',
      'DELETE /r2/multipart',
      'POST /r2/delete',
    ]);
    expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({
      key: 'big',
      uploadId: 'u1',
      partNumber: '1',
    });
    expect(JSON.parse(calls[2]!.body as string)).toEqual({
      parts: [{ partNumber: 1, etag: 'e1' }],
    });
    expect(JSON.parse(calls[4]!.body as string)).toEqual({ keys: ['a', 'b'] });
  });
});
