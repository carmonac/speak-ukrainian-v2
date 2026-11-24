import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassThrough, type Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type ListObjectsV2CommandOutput,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Env } from '../../config/configuration.js';
import { SUPABASE_ADMIN, type SupabaseAdmin } from '../supabase/supabase.module.js';
import { S3_CLIENT } from './storage.tokens.js';

export interface PutOptions {
  contentType?: string;
  cacheControl?: string;
}

export interface StoredObject {
  path: string;
  sizeBytes: number;
  createdAt: Date;
}

/**
 * Hard ceiling on one listing. A prefix wider than this is a caller bug — an
 * unbounded enumeration of the whole bucket — not a page to fetch.
 */
export const MAX_STORAGE_LIST_RESULTS = 10_000;

/** Objects per API call; S3 caps a page at 1000. */
const LIST_PAGE_SIZE = 1_000;

@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(SUPABASE_ADMIN) private readonly supabase: SupabaseAdmin,
    config: ConfigService<Env, true>,
  ) {
    this.bucket = config.get('STORAGE_BUCKET', { infer: true });
  }

  /** Creates the private bucket on first boot, so a fresh project needs no manual step. */
  async onApplicationBootstrap(): Promise<void> {
    const { data, error } = await this.supabase.storage.getBucket(this.bucket);
    if (data) {
      return;
    }
    const created = await this.supabase.storage.createBucket(this.bucket, { public: false });
    if (created.error && !/already exists/i.test(created.error.message)) {
      this.logger.error(
        `Could not create the "${this.bucket}" storage bucket: ${created.error.message}` +
          (error ? ` (lookup said: ${error.message})` : ''),
      );
      return;
    }
    this.logger.log(`Created private storage bucket "${this.bucket}"`);
  }

  async put(
    path: string,
    body: Buffer | NodeJS.ReadableStream,
    options: PutOptions = {},
  ): Promise<void> {
    const common = {
      Bucket: this.bucket,
      Key: path,
      ...(options.contentType ? { ContentType: options.contentType } : {}),
      ...(options.cacheControl ? { CacheControl: options.cacheControl } : {}),
    };

    if (Buffer.isBuffer(body)) {
      await this.s3.send(new PutObjectCommand({ ...common, Body: body }));
      return;
    }

    // A stream has no known length, which a plain PutObject requires.
    await new Upload({ client: this.s3, params: { ...common, Body: body as Readable } }).done();
  }

  async delete(path: string): Promise<void> {
    // S3 deletes are idempotent: removing an absent key succeeds.
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: path }));
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }

  /** Size and creation time, or null if the object is absent. */
  async stat(path: string): Promise<{ sizeBytes: number; createdAt: Date } | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: path }));
      return {
        sizeBytes: Number(head.ContentLength ?? 0),
        createdAt: createdAtOf(head.LastModified),
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Every object under `prefix`, paged internally. Throws past `limit` rather
   * than truncating: a caller that silently gets half a listing deletes half a
   * piece of content, or reinstalls a library it already has.
   */
  async list(prefix: string, limit = MAX_STORAGE_LIST_RESULTS): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];

    await this.eachPage({ prefix }, (page) => {
      objects.push(...objectsOf(page));
      if (objects.length > limit) {
        throw new Error(`Listing "${prefix}" returned more than ${limit} objects.`);
      }
    });

    return objects;
  }

  /**
   * At most `max` objects under `prefix`, in listing order, deliberately
   * truncated rather than refused. For callers that act on objects and will be
   * called again, such as the temporary-file sweep.
   */
  async listUpTo(prefix: string, max: number): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];

    await this.eachPage({ prefix }, (page) => {
      for (const object of objectsOf(page)) {
        if (objects.length >= max) {
          break;
        }
        objects.push(object);
      }
      return objects.length < max;
    });

    return objects;
  }

  /**
   * Immediate pseudo-directories under `prefix`, without the trailing slash —
   * `h5p/libraries/` → `['H5P.Foo-1.0', 'H5P.Bar-1.2']`.
   */
  async listSubdirectories(prefix: string, limit = MAX_STORAGE_LIST_RESULTS): Promise<string[]> {
    const directories = new Set<string>();

    await this.eachPage({ prefix, delimiter: '/' }, (page) => {
      for (const found of page.CommonPrefixes ?? []) {
        const name = (found.Prefix ?? '').slice(prefix.length).replace(/\/$/, '');
        if (name !== '') {
          directories.add(name);
        }
      }
      if (directories.size > limit) {
        throw new Error(`Listing "${prefix}" returned more than ${limit} directories.`);
      }
    });

    return [...directories];
  }

  /**
   * Deletes every object under `prefix`, which must end in `/`.
   *
   * The trailing slash is asserted rather than appended, so a caller that built
   * the prefix by hand fails loudly: deleting `h5p/content/abc` without it
   * would also take out `h5p/content/abcdef/…`.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    if (!prefix.endsWith('/')) {
      throw new Error(`A delete prefix must end in "/", got "${prefix}".`);
    }

    // Collected first: deleting while paging would shift the continuation window.
    const keys: string[] = [];
    await this.eachPage({ prefix }, (page) => {
      keys.push(...objectsOf(page).map((object) => object.path));
    });

    for (let i = 0; i < keys.length; i += LIST_PAGE_SIZE) {
      const batch = keys.slice(i, i + LIST_PAGE_SIZE);
      const result = await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const failed = result.Errors ?? [];
      if (failed.length > 0) {
        throw new Error(
          `Could not delete ${failed.length} object(s) under "${prefix}": ${failed[0]?.Message ?? 'unknown error'}`,
        );
      }
    }
  }

  /**
   * A readable for one object, optionally a byte range (both ends inclusive).
   *
   * Returned synchronously because H5P's storage interfaces expect a stream,
   * not a promise of one; a failed request surfaces as an `error` on it.
   */
  createReadStream(path: string, range?: { start?: number; end?: number }): Readable {
    const out = new PassThrough();
    const rangeHeader =
      range && (range.start !== undefined || range.end !== undefined)
        ? `bytes=${range.start ?? 0}-${range.end ?? ''}`
        : undefined;

    this.s3
      .send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: path,
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        }),
      )
      .then((response) => {
        const body = response.Body as Readable | undefined;
        if (!body) {
          out.end();
          return;
        }
        body.on('error', (error) => out.destroy(error));
        out.on('close', () => body.destroy());
        body.pipe(out);
      })
      .catch((error: unknown) => {
        out.destroy(error instanceof Error ? error : new Error(String(error)));
      });

    return out;
  }

  private async eachPage(
    query: { prefix: string; delimiter?: string },
    onPage: (page: ListObjectsV2CommandOutput) => boolean | void | Promise<boolean | void>,
  ): Promise<void> {
    let token: string | undefined;

    do {
      const page: ListObjectsV2CommandOutput = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: query.prefix,
          MaxKeys: LIST_PAGE_SIZE,
          ...(query.delimiter ? { Delimiter: query.delimiter } : {}),
          ...(token ? { ContinuationToken: token } : {}),
        }),
      );
      // A callback that returns `false` has seen enough.
      if ((await onPage(page)) === false) {
        return;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}

function objectsOf(page: ListObjectsV2CommandOutput): StoredObject[] {
  return (page.Contents ?? [])
    .filter((object) => typeof object.Key === 'string' && !object.Key.endsWith('/'))
    .map((object) => ({
      path: object.Key as string,
      sizeBytes: Number(object.Size ?? 0),
      createdAt: createdAtOf(object.LastModified),
    }));
}

/**
 * Epoch when the object carries no usable timestamp, so callers that derive an
 * expiry from it never compute with an `Invalid Date`.
 */
function createdAtOf(value: Date | undefined): Date {
  return value && Number.isFinite(value.getTime()) ? value : new Date(0);
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}
