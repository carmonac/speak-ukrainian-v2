import { Readable } from 'node:stream';
import type { ConfigService } from '@nestjs/config';
import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/configuration.js';
import type { SupabaseAdmin } from '../supabase/supabase.module.js';
import { StorageService } from './storage.service.js';

interface Sent {
  name: string;
  input: Record<string, unknown>;
}

/**
 * An S3 client holding objects in a map and answering the six commands the
 * service sends, with real pagination (two keys per page) so the paging loops
 * are exercised.
 */
class FakeS3 {
  readonly objects = new Map<string, Buffer>();
  readonly sent: Sent[] = [];
  pageSize = 2;
  failDeleteOf: string | null = null;

  asClient(): S3Client {
    return this as unknown as S3Client;
  }

  send(command: {
    constructor: { name: string };
    input: Record<string, unknown>;
  }): Promise<unknown> {
    const name = command.constructor.name;
    const input = command.input;
    this.sent.push({ name, input });
    const key = input['Key'] as string;

    switch (name) {
      case 'PutObjectCommand':
        this.objects.set(key, input['Body'] as Buffer);
        return Promise.resolve({});
      case 'DeleteObjectCommand':
        this.objects.delete(key);
        return Promise.resolve({});
      case 'HeadObjectCommand': {
        const body = this.objects.get(key);
        if (!body) {
          return Promise.reject(
            Object.assign(new Error('NotFound'), {
              name: 'NotFound',
              $metadata: { httpStatusCode: 404 },
            }),
          );
        }
        return Promise.resolve({ ContentLength: body.length, LastModified: new Date(1_000) });
      }
      case 'GetObjectCommand': {
        const body = this.objects.get(key);
        if (!body) {
          return Promise.reject(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
        }
        const range = /^bytes=(\d+)-(\d*)$/.exec((input['Range'] as string | undefined) ?? '');
        const slice = range
          ? body.subarray(Number(range[1]), range[2] === '' ? undefined : Number(range[2]) + 1)
          : body;
        return Promise.resolve({ Body: Readable.from([slice]) });
      }
      case 'ListObjectsV2Command':
        return Promise.resolve(this.list(input));
      case 'DeleteObjectsCommand': {
        const keys = (input['Delete'] as { Objects: { Key: string }[] }).Objects.map((o) => o.Key);
        const errors = [];
        for (const k of keys) {
          if (k === this.failDeleteOf) {
            errors.push({ Key: k, Message: 'AccessDenied' });
          } else {
            this.objects.delete(k);
          }
        }
        return Promise.resolve({ Errors: errors });
      }
      default:
        return Promise.reject(new Error(`unexpected command ${name}`));
    }
  }

  private list(input: Record<string, unknown>): unknown {
    const prefix = input['Prefix'] as string;
    const delimiter = input['Delimiter'] as string | undefined;
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();

    const contents: string[] = [];
    const prefixes = new Set<string>();
    for (const key of keys) {
      const rest = key.slice(prefix.length);
      const cut = delimiter ? rest.indexOf(delimiter) : -1;
      if (cut >= 0) {
        prefixes.add(prefix + rest.slice(0, cut + 1));
      } else {
        contents.push(key);
      }
    }

    const entries = [
      ...contents.map((key) => ({ key })),
      ...[...prefixes].map((p) => ({ prefix: p })),
    ];
    const start = Number((input['ContinuationToken'] as string | undefined) ?? 0);
    const page = entries.slice(start, start + this.pageSize);
    const next = start + this.pageSize;

    return {
      Contents: page
        .filter((e) => 'key' in e)
        .map((e) => ({
          Key: (e as { key: string }).key,
          Size: this.objects.get((e as { key: string }).key)?.length ?? 0,
          LastModified: new Date(1_000),
        })),
      CommonPrefixes: page
        .filter((e) => 'prefix' in e)
        .map((e) => ({ Prefix: (e as { prefix: string }).prefix })),
      IsTruncated: next < entries.length,
      NextContinuationToken: next < entries.length ? String(next) : undefined,
    };
  }
}

function harness(): { service: StorageService; s3: FakeS3 } {
  const s3 = new FakeS3();
  const config = { get: () => 'h5p' } as unknown as ConfigService<Env, true>;
  const service = new StorageService(s3.asClient(), {} as SupabaseAdmin, config);
  return { service, s3 };
}

async function text(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('StorageService', () => {
  it('puts a buffer with its content type, into the configured bucket', async () => {
    const { service, s3 } = harness();
    await service.put('a/b.json', Buffer.from('{}'), { contentType: 'application/json' });

    expect(s3.sent[0]).toEqual({
      name: 'PutObjectCommand',
      input: {
        Bucket: 'h5p',
        Key: 'a/b.json',
        ContentType: 'application/json',
        Body: Buffer.from('{}'),
      },
    });
  });

  it('reports existence and size, and null for an absent object', async () => {
    const { service } = harness();
    await service.put('a/one', Buffer.from('12345'));

    expect(await service.exists('a/one')).toBe(true);
    expect(await service.exists('a/none')).toBe(false);
    expect(await service.stat('a/one')).toEqual({ sizeBytes: 5, createdAt: new Date(1_000) });
    expect(await service.stat('a/none')).toBeNull();
  });

  it('rethrows a stat failure that is not "not found"', async () => {
    const { service, s3 } = harness();
    s3.send = () => Promise.reject(Object.assign(new Error('boom'), { name: 'InternalError' }));

    await expect(service.stat('a/one')).rejects.toThrow('boom');
  });

  it('deletes an object, and deleting an absent one succeeds', async () => {
    const { service, s3 } = harness();
    await service.put('a/one', Buffer.from('x'));

    await service.delete('a/one');
    await service.delete('a/one');

    expect(s3.objects.size).toBe(0);
  });

  it('lists every object under a prefix across pages, with sizes', async () => {
    const { service } = harness();
    for (const name of ['a/1', 'a/2', 'a/3', 'a/sub/4', 'b/5']) {
      await service.put(name, Buffer.from(name));
    }

    const listed = await service.list('a/');

    expect(listed.map((o) => o.path)).toEqual(['a/1', 'a/2', 'a/3', 'a/sub/4']);
    expect(listed[0]).toEqual({ path: 'a/1', sizeBytes: 3, createdAt: new Date(1_000) });
  });

  it('refuses a listing wider than the limit instead of truncating it', async () => {
    const { service } = harness();
    for (const name of ['a/1', 'a/2', 'a/3']) {
      await service.put(name, Buffer.from('x'));
    }

    await expect(service.list('a/', 2)).rejects.toThrow(/more than 2 objects/);
  });

  it('listUpTo truncates deliberately and stops paging once it has enough', async () => {
    const { service, s3 } = harness();
    for (const name of ['a/1', 'a/2', 'a/3', 'a/4', 'a/5']) {
      await service.put(name, Buffer.from('x'));
    }
    s3.sent.length = 0;

    const listed = await service.listUpTo('a/', 2);

    expect(listed.map((o) => o.path)).toEqual(['a/1', 'a/2']);
    expect(s3.sent.filter((c) => c.name === 'ListObjectsV2Command')).toHaveLength(1);
  });

  it('lists immediate subdirectories without the trailing slash, across pages', async () => {
    const { service } = harness();
    for (const name of [
      'h5p/libraries/H5P.A-1.0/library.json',
      'h5p/libraries/H5P.A-1.0/js/a.js',
      'h5p/libraries/H5P.B-1.2/library.json',
      'h5p/libraries/H5P.C-2.0/library.json',
      'h5p/libraries/stray.txt',
    ]) {
      await service.put(name, Buffer.from('x'));
    }

    expect(await service.listSubdirectories('h5p/libraries/')).toEqual([
      'H5P.A-1.0',
      'H5P.B-1.2',
      'H5P.C-2.0',
    ]);
  });

  it('deletes everything under a prefix and nothing beside it', async () => {
    const { service, s3 } = harness();
    for (const name of ['c/abc/1', 'c/abc/2', 'c/abc/3', 'c/abcdef/1']) {
      await service.put(name, Buffer.from('x'));
    }

    await service.deleteByPrefix('c/abc/');

    expect([...s3.objects.keys()]).toEqual(['c/abcdef/1']);
  });

  it('refuses a delete prefix without a trailing slash', async () => {
    const { service, s3 } = harness();
    await service.put('c/abcdef/1', Buffer.from('x'));

    await expect(service.deleteByPrefix('c/abc')).rejects.toThrow(/must end in "\/"/);
    expect(s3.objects.size).toBe(1);
  });

  it('fails a prefix delete when the bucket reports objects it could not remove', async () => {
    const { service, s3 } = harness();
    await service.put('c/x/1', Buffer.from('x'));
    s3.failDeleteOf = 'c/x/1';

    await expect(service.deleteByPrefix('c/x/')).rejects.toThrow(/Could not delete 1 object/);
  });

  it('streams a whole object', async () => {
    const { service } = harness();
    await service.put('a/one', Buffer.from('0123456789'));

    expect(await text(service.createReadStream('a/one'))).toBe('0123456789');
  });

  it('streams a byte range, both ends inclusive', async () => {
    const { service, s3 } = harness();
    await service.put('a/one', Buffer.from('0123456789'));

    expect(await text(service.createReadStream('a/one', { start: 2, end: 5 }))).toBe('2345');
    expect(s3.sent.at(-1)?.input['Range']).toBe('bytes=2-5');
  });

  it('streams from an offset to the end when only a start is given', async () => {
    const { service, s3 } = harness();
    await service.put('a/one', Buffer.from('0123456789'));

    expect(await text(service.createReadStream('a/one', { start: 7 }))).toBe('789');
    expect(s3.sent.at(-1)?.input['Range']).toBe('bytes=7-');
  });

  it('surfaces a missing object as an error on the stream, not a throw', async () => {
    const { service } = harness();
    const stream = service.createReadStream('a/none');

    await expect(text(stream)).rejects.toThrow('NoSuchKey');
  });
});
