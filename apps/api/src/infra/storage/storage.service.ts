import { Inject, Injectable } from '@nestjs/common';
import { PassThrough, type Readable } from 'node:stream';
import {
  MAX_DELETE_KEYS,
  OBJECT_STORE,
  type ObjectInfo,
  type ObjectMetadata,
  type ObjectStoreDriver,
  type UploadedPart,
} from './object-store.js';

export type PutOptions = ObjectMetadata;

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

/** Objects per listing request; the store caps a page at 1000. */
const LIST_PAGE_SIZE = 1_000;

/**
 * How a stream is cut for upload. A stream that fits in one part is stored
 * with a single request; a longer one becomes a multipart upload of parts
 * this size.
 *
 * It bounds two things at once: what is held in memory per upload, and the
 * size of any one request to the gateway, which may not exceed 100 MiB when
 * it leaves a Cloudflare container. The store requires every part but the
 * last to be equal, and at least 5 MiB.
 */
export const UPLOAD_PART_BYTES = 8 * 1024 * 1024;

/**
 * Files of the application — H5P content, libraries and temporary uploads —
 * in one private bucket (Cloudflare R2). Nothing here is ever public: every
 * byte a browser receives is streamed through the API, which decides who may
 * read it.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(OBJECT_STORE) private readonly store: ObjectStoreDriver) {}

  async put(
    path: string,
    body: Buffer | NodeJS.ReadableStream,
    options: PutOptions = {},
  ): Promise<void> {
    if (Buffer.isBuffer(body)) {
      await this.store.put(path, body, options);
      return;
    }
    await this.putStream(path, body, options);
  }

  async delete(path: string): Promise<void> {
    // Idempotent: removing an absent object succeeds.
    await this.store.deleteMany([path]);
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }

  /** Size and creation time, or null if the object is absent. */
  async stat(path: string): Promise<{ sizeBytes: number; createdAt: Date } | null> {
    const info = await this.store.head(path);
    return info ? { sizeBytes: info.sizeBytes, createdAt: createdAtOf(info.uploadedAt) } : null;
  }

  /**
   * Every object under `prefix`, paged internally. Throws past `limit` rather
   * than truncating: a caller that silently gets half a listing deletes half a
   * piece of content, or reinstalls a library it already has.
   */
  async list(prefix: string, limit = MAX_STORAGE_LIST_RESULTS): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];

    await this.eachPage({ prefix }, (page) => {
      objects.push(...page.objects);
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
      for (const object of page.objects) {
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
      for (const found of page.prefixes) {
        const name = found.slice(prefix.length).replace(/\/$/, '');
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

    // Collected first: deleting while paging would shift the listing window.
    const keys: string[] = [];
    await this.eachPage({ prefix }, (page) => {
      keys.push(...page.objects.map((object) => object.path));
    });

    for (let i = 0; i < keys.length; i += MAX_DELETE_KEYS) {
      try {
        await this.store.deleteMany(keys.slice(i, i + MAX_DELETE_KEYS));
      } catch (error) {
        throw new Error(
          `Could not delete the objects under "${prefix}": ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
  }

  /**
   * A readable for one object, optionally a byte range (both ends inclusive).
   *
   * Returned synchronously because H5P's storage interfaces expect a stream,
   * not a promise of one; a failed request, or a missing object, surfaces as
   * an `error` on it.
   */
  createReadStream(path: string, range?: { start?: number; end?: number }): Readable {
    const out = new PassThrough();

    this.store
      .get(path, range)
      .then((body) => {
        if (!body) {
          out.destroy(new Error(`No object at "${path}".`));
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

  /**
   * Stores a stream of unknown length without ever holding more than one part
   * of it. See `UPLOAD_PART_BYTES`.
   */
  private async putStream(
    path: string,
    body: NodeJS.ReadableStream,
    options: PutOptions,
  ): Promise<void> {
    let uploadId: string | undefined;
    const parts: UploadedPart[] = [];

    try {
      for await (const { part, last } of partsOf(body, UPLOAD_PART_BYTES)) {
        if (last && uploadId === undefined) {
          // The whole stream fitted in one part.
          await this.store.put(path, part, options);
          return;
        }
        uploadId ??= await this.store.createMultipart(path, options);
        parts.push(await this.store.uploadPart(path, uploadId, parts.length + 1, part));
      }
      if (uploadId !== undefined) {
        await this.store.completeMultipart(path, uploadId, parts);
      }
    } catch (error) {
      if (uploadId !== undefined) {
        // Uploaded parts are billed until the upload is completed or aborted.
        await this.store.abortMultipart(path, uploadId).catch(() => undefined);
      }
      throw error;
    }
  }

  private async eachPage(
    query: { prefix: string; delimiter?: string },
    onPage: (page: {
      objects: StoredObject[];
      prefixes: string[];
    }) => boolean | void | Promise<boolean | void>,
  ): Promise<void> {
    let cursor: string | undefined;

    do {
      const page = await this.store.list({
        prefix: query.prefix,
        limit: LIST_PAGE_SIZE,
        ...(query.delimiter ? { delimiter: query.delimiter } : {}),
        ...(cursor ? { cursor } : {}),
      });
      // A callback that returns `false` has seen enough.
      const more = await onPage({ objects: objectsOf(page.objects), prefixes: page.prefixes });
      if (more === false) {
        return;
      }
      cursor = page.cursor;
    } while (cursor);
  }
}

/**
 * Cuts a stream into buffers of exactly `size` bytes, the last one being
 * whatever is left (and flagged). An empty stream yields one empty, last part,
 * so an empty file is still stored.
 */
async function* partsOf(
  stream: NodeJS.ReadableStream,
  size: number,
): AsyncGenerator<{ part: Buffer; last: boolean }> {
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  // One full part is held back until more data (or the end) is seen, so the
  // final part can be marked as such.
  let ready: Buffer | undefined;

  for await (const chunk of stream) {
    let data = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    while (data.length > 0) {
      const take = Math.min(size - pendingBytes, data.length);
      pending.push(data.subarray(0, take));
      pendingBytes += take;
      data = data.subarray(take);

      if (pendingBytes === size) {
        if (ready) {
          yield { part: ready, last: false };
        }
        ready = Buffer.concat(pending, size);
        pending = [];
        pendingBytes = 0;
      }
    }
  }

  if (pendingBytes > 0) {
    if (ready) {
      yield { part: ready, last: false };
    }
    yield { part: Buffer.concat(pending, pendingBytes), last: true };
  } else {
    yield { part: ready ?? Buffer.alloc(0), last: true };
  }
}

function objectsOf(objects: ObjectInfo[]): StoredObject[] {
  return objects
    .filter((object) => !object.key.endsWith('/'))
    .map((object) => ({
      path: object.key,
      sizeBytes: object.sizeBytes,
      createdAt: createdAtOf(object.uploadedAt),
    }));
}

/**
 * Epoch when the object carries no usable timestamp, so callers that derive an
 * expiry from it never compute with an `Invalid Date`.
 */
function createdAtOf(value: Date | undefined): Date {
  return value && Number.isFinite(value.getTime()) ? value : new Date(0);
}
