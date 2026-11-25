import type { Readable } from 'node:stream';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Page, SiteFile } from '@speakukrainian/shared';
import type { Env } from '../config/configuration.js';
import { newId } from '../infra/db/database.service.js';
import { StorageService } from '../infra/storage/storage.service.js';
import {
  SITE_FILES_PREFIX,
  contentTypeOf,
  isSiteFileId,
  parseSiteFileKey,
  sanitizeFileName,
  siteFileKey,
  siteFilePath,
  siteFilePrefix,
} from './site-files.js';

/** Uploaded once and never changed at that address, so it may be kept for a year. */
export const SITE_FILE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface OpenedSiteFile {
  stream: Readable;
  contentType: string;
  /** Size of the whole file. */
  sizeBytes: number;
  /** Present when only part of the file was asked for; both ends inclusive. */
  range?: { start: number; end: number };
}

/**
 * Files the administrator uploads for the site's pages.
 *
 * They live in the same private bucket as the H5P content, under a prefix of
 * their own (`site/files/`). The bucket is never public; these files are,
 * because the site serves them (`SiteService`) to anyone who asks for
 * `/files/<id>/<name>`. Everything here stays inside that prefix.
 *
 * Nothing about a file is stored anywhere else: its name is in its key, and
 * its size and date come from the bucket.
 */
@Injectable()
export class FilesService {
  private readonly siteUrl: string;

  constructor(
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL', { infer: true }).replace(/\/$/, '');
  }

  async upload(originalName: string, body: Buffer): Promise<SiteFile> {
    // A new id per upload: the same name twice gives two files, two URLs.
    const id = newId();
    const name = sanitizeFileName(originalName);
    await this.storage.put(siteFileKey(id, name), body, {
      contentType: contentTypeOf(name),
      cacheControl: SITE_FILE_CACHE_CONTROL,
    });
    return this.describe(id, name, body.length, new Date());
  }

  /** Newest first. */
  async list(query: { limit: number; offset: number }): Promise<Page<SiteFile>> {
    const files: SiteFile[] = [];
    for (const object of await this.storage.list(SITE_FILES_PREFIX)) {
      const parsed = parseSiteFileKey(object.path);
      if (parsed) {
        files.push(this.describe(parsed.id, parsed.name, object.sizeBytes, object.createdAt));
      }
    }
    files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id));
    return { items: files.slice(query.offset, query.offset + query.limit), total: files.length };
  }

  async remove(id: string): Promise<void> {
    if (!isSiteFileId(id)) {
      throw new NotFoundException('That file does not exist.');
    }
    const prefix = siteFilePrefix(id);
    if ((await this.storage.list(prefix)).length === 0) {
      throw new NotFoundException('That file does not exist.');
    }
    await this.storage.deleteByPrefix(prefix);
  }

  /**
   * Opens a file for a visitor, or returns null when there is none. `id` and
   * `name` come from `parseSiteFilePath`, which is what guarantees the key
   * stays under the site-files prefix.
   */
  async open(id: string, name: string, rangeHeader?: string): Promise<OpenedSiteFile | null> {
    const key = siteFileKey(id, name);
    const stat = await this.storage.stat(key);
    if (!stat) {
      return null;
    }
    const range = parseRange(rangeHeader, stat.sizeBytes);
    return {
      stream: this.storage.createReadStream(key, range ?? undefined),
      contentType: contentTypeOf(name),
      sizeBytes: stat.sizeBytes,
      ...(range ? { range } : {}),
    };
  }

  private describe(id: string, name: string, sizeBytes: number, uploadedAt: Date): SiteFile {
    return {
      id,
      name,
      url: `${this.siteUrl}${siteFilePath(id, name)}`,
      sizeBytes,
      uploadedAt: uploadedAt.toISOString(),
    };
  }
}

/**
 * A single `bytes=a-b`, `bytes=a-` or `bytes=-n` range, clamped to the file.
 * Anything else (several ranges, nonsense, out of bounds) is ignored and the
 * whole file is sent, which every client accepts.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match || size === 0) {
    return null;
  }
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') {
    return null;
  }
  let start: number;
  let end: number;
  if (from === '') {
    // The last n bytes.
    start = Math.max(0, size - Number(to));
    end = size - 1;
  } else {
    start = Number(from);
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}
