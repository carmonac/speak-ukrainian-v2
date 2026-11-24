import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Injectable } from '@nestjs/common';
import { BridgeClient, type BridgeRequest } from '../bridge/bridge.client.js';
import type {
  ObjectInfo,
  ObjectMetadata,
  ObjectPage,
  ObjectStoreDriver,
  UploadedPart,
} from './object-store.js';

interface WireObject {
  key: string;
  size: number;
  uploaded: string;
}

/** A part is a few megabytes over a local hop; this is generous. */
const UPLOAD_TIMEOUT_MS = 120_000;

/** Cloudflare R2 through the gateway's bridge. */
@Injectable()
export class BridgeObjectStore implements ObjectStoreDriver {
  constructor(private readonly bridge: BridgeClient) {}

  async put(key: string, body: Buffer, metadata: ObjectMetadata): Promise<void> {
    await this.expectOk({
      method: 'PUT',
      path: '/r2/object',
      query: { key },
      headers: metadataHeaders(metadata),
      body,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const response = await this.bridge.send({ method: 'GET', path: '/r2/stat', query: { key } });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    await this.assertOk(response, `GET /r2/stat ${key}`);
    return toInfo((await response.json()) as WireObject);
  }

  async get(key: string, range?: { start?: number; end?: number }): Promise<Readable | null> {
    const ranged = range && (range.start !== undefined || range.end !== undefined);
    const response = await this.bridge.send({
      method: 'GET',
      path: '/r2/object',
      query: { key },
      ...(ranged ? { headers: { range: `bytes=${range.start ?? 0}-${range.end ?? ''}` } } : {}),
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    await this.assertOk(response, `GET /r2/object ${key}`);
    return response.body
      ? Readable.fromWeb(response.body as unknown as WebReadableStream)
      : Readable.from([]);
  }

  async list(query: {
    prefix: string;
    delimiter?: string;
    cursor?: string;
    limit: number;
  }): Promise<ObjectPage> {
    const response = await this.expectOk({ method: 'GET', path: '/r2/list', query });
    const page = (await response.json()) as {
      objects: WireObject[];
      prefixes: string[];
      cursor?: string;
    };
    return {
      objects: page.objects.map(toInfo),
      prefixes: page.prefixes,
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  }

  async deleteMany(keys: string[]): Promise<void> {
    await this.expectOk({ method: 'POST', path: '/r2/delete', body: JSON.stringify({ keys }) });
  }

  async createMultipart(key: string, metadata: ObjectMetadata): Promise<string> {
    const response = await this.expectOk({
      method: 'POST',
      path: '/r2/multipart',
      query: { key },
      headers: metadataHeaders(metadata),
    });
    return ((await response.json()) as { uploadId: string }).uploadId;
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<UploadedPart> {
    const response = await this.expectOk({
      method: 'PUT',
      path: '/r2/multipart/part',
      query: { key, uploadId, partNumber },
      body,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
    return (await response.json()) as UploadedPart;
  }

  async completeMultipart(key: string, uploadId: string, parts: UploadedPart[]): Promise<void> {
    await this.expectOk({
      method: 'POST',
      path: '/r2/multipart/complete',
      query: { key, uploadId },
      body: JSON.stringify({ parts }),
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    await this.expectOk({ method: 'DELETE', path: '/r2/multipart', query: { key, uploadId } });
  }

  /** Sends, and throws unless the bridge answered 2xx. A JSON-less success has its body drained. */
  private async expectOk(request: BridgeRequest): Promise<Response> {
    const response = await this.bridge.send(request);
    await this.assertOk(response, `${request.method} ${request.path}`);
    if (response.status === 204) {
      await response.body?.cancel();
    }
    return response;
  }

  private async assertOk(response: Response, what: string): Promise<void> {
    if (!response.ok) {
      const failure = await this.bridge.failureOf(response);
      throw new Error(`Storage request failed (${what}, ${response.status}): ${failure.message}`);
    }
  }
}

function metadataHeaders(metadata: ObjectMetadata): Record<string, string> {
  return {
    ...(metadata.contentType ? { 'content-type': metadata.contentType } : {}),
    ...(metadata.cacheControl ? { 'cache-control': metadata.cacheControl } : {}),
  };
}

function toInfo(object: WireObject): ObjectInfo {
  const uploadedAt = new Date(object.uploaded);
  return {
    key: object.key,
    sizeBytes: object.size,
    uploadedAt: Number.isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt,
  };
}
