import type { Readable } from 'node:stream';

export interface ObjectMetadata {
  contentType?: string;
  cacheControl?: string;
}

export interface ObjectInfo {
  key: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface ObjectPage {
  objects: ObjectInfo[];
  /** With a delimiter: the pseudo-directories directly under the prefix, each ending in it. */
  prefixes: string[];
  /** Present when there is another page. */
  cursor?: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

/**
 * The object store as `StorageService` needs it: Cloudflare R2 through the
 * gateway bridge in the running API, a map in the tests.
 */
export interface ObjectStoreDriver {
  put(key: string, body: Buffer, metadata: ObjectMetadata): Promise<void>;
  /** Null when there is no such object. */
  head(key: string): Promise<ObjectInfo | null>;
  /** Null when there is no such object. Both ends of the range are inclusive. */
  get(key: string, range?: { start?: number; end?: number }): Promise<Readable | null>;
  list(query: {
    prefix: string;
    delimiter?: string;
    cursor?: string;
    limit: number;
  }): Promise<ObjectPage>;
  /** At most `MAX_DELETE_KEYS`. Absent keys are not an error. */
  deleteMany(keys: string[]): Promise<void>;

  createMultipart(key: string, metadata: ObjectMetadata): Promise<string>;
  /** Every part but the last must have the same size. */
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<UploadedPart>;
  completeMultipart(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
}

export const OBJECT_STORE = Symbol('OBJECT_STORE');

/** R2 deletes at most this many keys per call. */
export const MAX_DELETE_KEYS = 1_000;
