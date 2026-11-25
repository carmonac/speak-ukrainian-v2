import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  MAX_SITE_FILE_BYTES,
  siteFileTooLargeMessage,
  type Page,
  type SiteFile,
} from '@speakukrainian/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import { InMemoryStorage } from '../h5p/h5p.storage-fake.js';
import type { DatabaseService } from '../infra/db/database.service.js';
import type { PageCache } from '../site/page-cache.js';
import type { SiteRenderer } from '../site/site.renderer.js';
import { SiteService } from '../site/site.service.js';
import { ADMIN_TOKEN, STUDENT_TOKEN, createHttpTestApp } from '../testing/http-test-app.js';
import { FilesController } from './files.controller.js';
import { FilesService, SITE_FILE_CACHE_CONTROL, parseRange } from './files.service.js';
import { contentTypeOf, parseSiteFilePath, sanitizeFileName } from './site-files.js';

const SITE = 'https://site.example';
const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };
const student = { Authorization: `Bearer ${STUDENT_TOKEN}` };

describe('site files over HTTP', () => {
  let storage: InMemoryStorage;
  let app: INestApplication;

  const server = () => request(app.getHttpServer());
  const pathOf = (file: SiteFile): string => new URL(file.url).pathname;

  async function upload(name: string, body: string | Buffer = 'content'): Promise<SiteFile> {
    const response = await server()
      .post('/api/admin/files')
      .set(admin)
      .attach('file', Buffer.isBuffer(body) ? body : Buffer.from(body), name)
      .expect(201);
    return response.body as SiteFile;
  }

  beforeEach(async () => {
    storage = new InMemoryStorage();
    const config = { get: () => SITE } as unknown as ConfigService<Env, true>;
    const files = new FilesService(storage.asStorageService(), config);
    // Only the file route of the site is exercised: pages are not involved.
    const site = new SiteService(
      {} as PageCache,
      {} as SiteRenderer,
      {} as DatabaseService,
      files,
      config,
    );
    app = await createHttpTestApp({
      controllers: [{ controller: FilesController, inject: [FilesService] }],
      providers: [{ provide: FilesService, useValue: files }],
      configure: (nest) => nest.use(site.middleware),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('uploading', () => {
    it('is refused without a session', async () => {
      await server().post('/api/admin/files').attach('file', Buffer.from('x'), 'a.txt').expect(401);
      expect(storage.paths()).toEqual([]);
    });

    it('is refused to a signed-in user who is not an administrator', async () => {
      await server()
        .post('/api/admin/files')
        .set(student)
        .attach('file', Buffer.from('x'), 'a.txt')
        .expect(403);
      expect(storage.paths()).toEqual([]);
    });

    it('stores the file under the site prefix and answers with its public URL', async () => {
      const file = await upload('logo.png', 'png-bytes');

      expect(file.name).toBe('logo.png');
      expect(file.sizeBytes).toBe(9);
      expect(file.url).toBe(`${SITE}/files/${file.id}/logo.png`);
      expect(storage.paths()).toEqual([`site/files/${file.id}/logo.png`]);
    });

    it('keeps two files uploaded with the same name apart', async () => {
      const first = await upload('photo.jpg', 'first');
      const second = await upload('photo.jpg', 'second');

      expect(second.url).not.toBe(first.url);
      expect((await server().get(pathOf(first)).expect(200)).body.toString()).toBe('first');
      expect((await server().get(pathOf(second)).expect(200)).body.toString()).toBe('second');
    });

    it('refuses a file over the limit with a message that names the limit', async () => {
      const response = await server()
        .post('/api/admin/files')
        .set(admin)
        .attach('file', Buffer.alloc(MAX_SITE_FILE_BYTES + 1), 'big.bin')
        .expect(413);

      expect((response.body as { message: string }).message).toBe(siteFileTooLargeMessage());
      expect(siteFileTooLargeMessage()).toContain('25 MB');
      expect(storage.paths()).toEqual([]);
    });

    it('refuses a request with no file', async () => {
      await server().post('/api/admin/files').set(admin).field('other', 'x').expect(400);
    });

    it('keeps a non-ASCII name readable and its URL usable', async () => {
      const file = await upload('Привіт світ.pdf', 'pdf');

      expect(file.name).toBe('Привіт-світ.pdf');
      const response = await server().get(pathOf(file)).expect(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('serving', () => {
    it('gives the file to an anonymous visitor with its type and a long-lived cache header', async () => {
      const file = await upload('style.css', 'body { color: red }');

      const response = await server().get(pathOf(file)).expect(200);

      expect(response.text).toBe('body { color: red }');
      expect(response.headers['content-type']).toContain('text/css');
      expect(response.headers['cache-control']).toBe(SITE_FILE_CACHE_CONTROL);
      expect(SITE_FILE_CACHE_CONTROL).toContain('max-age=31536000');
      expect(response.headers['content-length']).toBe('19');
      // So the sandboxed page preview can load it too.
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('answers HEAD with the headers and no body', async () => {
      const file = await upload('a.txt', 'hello');
      const response = await server().head(pathOf(file)).expect(200);
      expect(response.headers['content-length']).toBe('5');
      expect(response.text ?? '').toBe('');
    });

    it('serves a byte range, as audio and video players ask for', async () => {
      const file = await upload('clip.mp3', '0123456789');

      const response = await server().get(pathOf(file)).set('Range', 'bytes=2-5').expect(206);

      expect(response.headers['content-range']).toBe('bytes 2-5/10');
      expect(response.headers['content-type']).toBe('audio/mpeg');
      expect((response.body as Buffer).toString()).toBe('2345');
    });

    it('answers 404 for a file that does not exist', async () => {
      const file = await upload('a.txt');
      await server().get(`/files/${file.id}/other.txt`).expect(404);
      await server().get('/files/00000000-0000-4000-8000-000000000000/a.txt').expect(404);
    });

    it('never reaches anything outside the site-files prefix', async () => {
      const file = await upload('a.txt');
      await storage.put('h5p/content/abc/h5p.json', Buffer.from('{"secret":true}'));
      await storage.put('site/other/private.txt', Buffer.from('secret'));

      const attempts = [
        '/files/h5p/content/abc/h5p.json',
        `/files/${file.id}/../../../h5p/content/abc/h5p.json`,
        `/files/${file.id}/..%2f..%2f..%2fh5p%2fcontent%2fabc%2fh5p.json`,
        `/files/${file.id}/%2e%2e/%2e%2e/%2e%2e/h5p/content/abc/h5p.json`,
        '/files/..%2f..%2fh5p/content/abc/h5p.json',
        '/files/%2e%2e/other/private.txt',
        '/files/../other/private.txt',
        `/files/${file.id}/a.txt/extra`,
        '/files/',
      ];
      for (const path of attempts) {
        const response = await server().get(path);
        expect(response.status, path).toBe(404);
        expect(response.text, path).not.toContain('secret');
      }
    });

    it('is read-only: the public route does not accept writes', async () => {
      const file = await upload('a.txt');
      await server().delete(pathOf(file)).expect(404);
      await server().put(pathOf(file)).send('x').expect(404);
      expect(storage.paths()).toHaveLength(1);
    });
  });

  describe('listing', () => {
    const list = async (query = ''): Promise<Page<SiteFile>> =>
      (await server().get(`/api/admin/files${query}`).set(admin).expect(200))
        .body as Page<SiteFile>;

    it('is for administrators only', async () => {
      await server().get('/api/admin/files').expect(401);
      await server().get('/api/admin/files').set(student).expect(403);
    });

    it('lists site files with name, URL, size and date, and nothing else in the bucket', async () => {
      const file = await upload('a.txt', 'hello');
      await storage.put('h5p/content/abc/h5p.json', Buffer.from('{}'));
      await storage.put('h5p/libraries/Lib-1.0/library.json', Buffer.from('{}'));

      const page = await list();

      expect(page.total).toBe(1);
      expect(page.items).toEqual([
        {
          id: file.id,
          name: 'a.txt',
          url: file.url,
          sizeBytes: 5,
          uploadedAt: '2026-05-01T00:00:00.000Z',
        },
      ]);
    });

    it('pages through the files without repeating or skipping any', async () => {
      const uploaded: string[] = [];
      for (let i = 0; i < 7; i++) {
        uploaded.push((await upload(`file-${i}.txt`)).id);
      }

      const first = await list('?limit=3&offset=0');
      const second = await list('?limit=3&offset=3');
      const third = await list('?limit=3&offset=6');

      expect([first.total, second.total, third.total]).toEqual([7, 7, 7]);
      expect([first.items.length, second.items.length, third.items.length]).toEqual([3, 3, 1]);
      const seen = [...first.items, ...second.items, ...third.items].map((f) => f.id);
      expect([...seen].sort()).toEqual([...uploaded].sort());
      expect((await list('?limit=3&offset=9')).items).toEqual([]);
    });

    it('puts the newest upload first', async () => {
      const older = await upload('older.txt');
      const newer = await upload('newer.txt');
      storage.objects.get(`site/files/${newer.id}/newer.txt`)!.createdAt = new Date(
        '2026-06-01T00:00:00.000Z',
      );

      expect((await list()).items.map((f) => f.id)).toEqual([newer.id, older.id]);
    });

    it('refuses a page size that is not a sensible number', async () => {
      await server().get('/api/admin/files?limit=0').set(admin).expect(400);
      await server().get('/api/admin/files?limit=abc').set(admin).expect(400);
    });
  });

  describe('deleting', () => {
    it('is for administrators only', async () => {
      const file = await upload('a.txt');
      await server().delete(`/api/admin/files/${file.id}`).expect(401);
      await server().delete(`/api/admin/files/${file.id}`).set(student).expect(403);
      expect(storage.paths()).toHaveLength(1);
    });

    it('removes the file from the bucket, the list and the public URL', async () => {
      const kept = await upload('kept.txt');
      const gone = await upload('gone.txt');

      await server().delete(`/api/admin/files/${gone.id}`).set(admin).expect(204);

      expect(storage.paths()).toEqual([`site/files/${kept.id}/kept.txt`]);
      await server().get(pathOf(gone)).expect(404);
      await server().get(pathOf(kept)).expect(200);
      await server().delete(`/api/admin/files/${gone.id}`).set(admin).expect(404);
    });

    it('cannot be pointed at anything that is not a site file', async () => {
      await storage.put('h5p/content/abc/h5p.json', Buffer.from('{}'));
      await storage.put('site/files-other/x.txt', Buffer.from('x'));

      for (const id of ['abc', '..', '..%2f..%2fh5p', 'h5p', '%2e%2e']) {
        const response = await server().delete(`/api/admin/files/${id}`).set(admin);
        expect([400, 404], id).toContain(response.status);
      }
      await server()
        .delete('/api/admin/files/00000000-0000-4000-8000-000000000000')
        .set(admin)
        .expect(404);
      expect(storage.paths()).toEqual(['h5p/content/abc/h5p.json', 'site/files-other/x.txt']);
    });
  });
});

describe('site file names and paths', () => {
  it('only accepts /files/<uuid>/<name>', () => {
    const id = '3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b';
    expect(parseSiteFilePath(`/files/${id}/a.txt`)).toEqual({ id, name: 'a.txt' });
    expect(parseSiteFilePath(`/files/${id}/..`)).toBeNull();
    expect(parseSiteFilePath(`/files/${id}/a/b.txt`)).toBeNull();
    expect(parseSiteFilePath(`/files/${id}/a%2Fb.txt`)).toBeNull();
    expect(parseSiteFilePath('/files/not-an-id/a.txt')).toBeNull();
    expect(parseSiteFilePath(`/other/${id}/a.txt`)).toBeNull();
  });

  it('turns any upload name into one safe path segment', () => {
    expect(sanitizeFileName('My Photo (1).JPG')).toBe('My-Photo-(1).jpg');
    expect(sanitizeFileName('a b?c#d&e.txt')).toBe('a-b-c-d-e.txt');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\doc.pdf')).toBe('doc.pdf');
    expect(sanitizeFileName('...')).toBe('file');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName(`${'a'.repeat(300)}.png`)).toHaveLength(100);
    expect(sanitizeFileName(`${'a'.repeat(300)}.png`).endsWith('.png')).toBe(true);
  });

  it('decides the content type by the extension', () => {
    expect(contentTypeOf('a.PNG')).toBe('image/png');
    expect(contentTypeOf('font.woff2')).toBe('font/woff2');
    expect(contentTypeOf('unknown.xyz')).toBe('application/octet-stream');
    expect(contentTypeOf('no-extension')).toBe('application/octet-stream');
  });

  it('reads single byte ranges and ignores the rest', () => {
    expect(parseRange('bytes=0-3', 10)).toEqual({ start: 0, end: 3 });
    expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange('bytes=5-99', 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange('bytes=20-30', 10)).toBeNull();
    expect(parseRange('bytes=0-1,4-5', 10)).toBeNull();
    expect(parseRange(undefined, 10)).toBeNull();
  });
});
