import type { CourseSummary } from '@speakukrainian/shared';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import type { Clock } from '../infra/clock/clock.tokens.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { PublishedCourses } from '../courses/published-courses.js';
import { PagesController } from '../pages/pages.controller.js';
import { PagesService } from '../pages/pages.service.js';
import { ADMIN_TOKEN, STUDENT_TOKEN, createHttpTestApp } from '../testing/http-test-app.js';
import { PageCache } from './page-cache.js';
import { PreviewController } from './preview.controller.js';
import {
  MAX_PREVIEWS,
  PREVIEW_BANNER_TEXT,
  PREVIEW_TTL_MS,
  PreviewStore,
  withPreviewBanner,
} from './preview.js';
import { SiteRenderer } from './site.renderer.js';

class FakeClock implements Clock {
  private time = 1_000_000;
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}

describe('withPreviewBanner', () => {
  it('says exactly what the task asks for', () => {
    expect(PREVIEW_BANNER_TEXT).toBe(
      'This is a preview, if you want to keep it, save it in the editor.',
    );
  });

  it('puts the banner first in the body and leaves the rest of the page untouched', () => {
    const page =
      '<!doctype html><html><head><title>T</title></head><body class="x"><h1>Hi</h1></body></html>';
    const result = withPreviewBanner(page);

    const banner = /<div data-preview-banner[^>]*>[^<]*<\/div>/.exec(result);
    expect(banner?.[0]).toContain(PREVIEW_BANNER_TEXT);
    expect(result.indexOf('<body class="x"><div data-preview-banner')).toBeGreaterThan(0);
    expect(result.replace(banner![0], '')).toBe(page);
  });

  it('draws the banner over the page instead of pushing it down', () => {
    const banner = withPreviewBanner('<body></body>');
    expect(banner).toContain('position: fixed');
    expect(banner).toContain('top: 0');
    expect(banner).toContain('pointer-events: none');
  });

  it('still shows the banner on a template with no body tag', () => {
    const result = withPreviewBanner('<h1>Hi</h1>');
    expect(result.startsWith('<div data-preview-banner')).toBe(true);
    expect(result.endsWith('<h1>Hi</h1>')).toBe(true);
  });
});

describe('PreviewStore', () => {
  it('gives each preview its own unguessable token', () => {
    const store = new PreviewStore(new FakeClock());
    const a = store.add('<p>a</p>');
    const b = store.add('<p>b</p>');

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(store.get(a)).toBe('<p>a</p>');
    expect(store.get(b)).toBe('<p>b</p>');
    expect(store.get('nope')).toBeNull();
  });

  it('forgets a preview once it expires', () => {
    const clock = new FakeClock();
    const store = new PreviewStore(clock);
    const token = store.add('<p>a</p>');

    clock.advance(PREVIEW_TTL_MS - 1);
    expect(store.get(token)).toBe('<p>a</p>');
    clock.advance(1);
    expect(store.get(token)).toBeNull();
    expect(store.size).toBe(0);
  });

  it('keeps a bounded number, dropping the oldest', () => {
    const store = new PreviewStore(new FakeClock());
    const first = store.add('first');
    for (let i = 0; i < MAX_PREVIEWS; i++) {
      store.add(`p${i}`);
    }
    expect(store.size).toBe(MAX_PREVIEWS);
    expect(store.get(first)).toBeNull();
  });
});

describe('page preview over HTTP', () => {
  const SITE = 'https://site.example';
  const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  let t: TestDatabase;
  let clock: FakeClock;
  let app: INestApplication;

  const server = () => request(app.getHttpServer());
  const draft = {
    title: 'Draft',
    content:
      '<!doctype html><html><head><title>{{ title }}</title></head><body><h1>{{ heading }}</h1><script>window.ran = true</script></body></html>',
    texts: [
      {
        key: 'heading',
        translations: [
          { locale: 'en', value: 'Hello' },
          { locale: 'uk', value: 'Привіт' },
        ],
      },
    ],
  };

  async function link(body: object = draft): Promise<string> {
    const response = await server()
      .post('/api/admin/pages/preview-link')
      .set(admin)
      .send(body)
      .expect(200);
    const url = new URL((response.body as { url: string }).url);
    expect(url.origin).toBe(SITE);
    return url.pathname;
  }

  beforeEach(async () => {
    t = createTestDatabase();
    clock = new FakeClock();
    const config = { get: () => SITE } as unknown as ConfigService<Env, true>;
    const pages = new PagesService(t.db);
    const store = new PreviewStore(clock);
    app = await createHttpTestApp({
      controllers: [
        {
          controller: PagesController,
          inject: [
            PagesService,
            SiteRenderer,
            PageCache,
            PreviewStore,
            PublishedCourses,
            ConfigService,
          ],
        },
        { controller: PreviewController, inject: [PreviewStore] },
      ],
      providers: [
        { provide: PagesService, useValue: pages },
        { provide: SiteRenderer, useValue: new SiteRenderer(config) },
        { provide: PageCache, useValue: new PageCache(pages, clock) },
        { provide: PreviewStore, useValue: store },
        {
          provide: PublishedCourses,
          useValue: {
            get: async (): Promise<CourseSummary[]> => [
              {
                id: 'c1',
                title: 'Ukrainian A1',
                slug: 'a1',
                summary: '<p><em>Hi</em></p>',
                summaryText: 'Hi',
                priceCents: 0,
                currency: 'eur',
                status: 'published',
                lessonCount: 1,
              },
            ],
          },
        },
        { provide: ConfigService, useValue: config },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('lets the previewed template list the published courses', async () => {
    const path = await link({
      ...draft,
      content: '{{#each courses}}<h2>{{ title }}</h2>{{ summary }}{{/each}}',
    });
    const response = await server().get(path).expect(200);
    expect(response.text).toContain('<h2>Ukrainian A1</h2><p><em>Hi</em></p>');
  });

  it('only gives a preview link to an administrator', async () => {
    await server().post('/api/admin/pages/preview-link').send(draft).expect(401);
    await server()
      .post('/api/admin/pages/preview-link')
      .set({ Authorization: `Bearer ${STUDENT_TOKEN}` })
      .send(draft)
      .expect(403);
  });

  it('shows the unsaved content with the banner, to a tab that sends no session', async () => {
    const path = await link();

    const response = await server().get(path).expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('<h1>Hello</h1>');
    expect(response.text).toContain(PREVIEW_BANNER_TEXT);
    expect(response.text).toContain('<script>window.ran = true</script>');
  });

  it('renders the language chosen in the editor', async () => {
    const response = await server()
      .get(await link({ ...draft, locale: 'uk' }))
      .expect(200);
    expect(response.text).toContain('<h1>Привіт</h1>');
  });

  it('isolates the preview from every origin and keeps it out of caches and search engines', async () => {
    const response = await server()
      .get(await link())
      .expect(200);

    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toMatch(/^sandbox /);
    expect(csp).toContain('allow-scripts');
    // With this the page would run as the site itself.
    expect(csp).not.toContain('allow-same-origin');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toContain('noindex');
  });

  it('saves nothing', async () => {
    const before = t.driver.statements.length;
    const path = await link();
    await server().get(path).expect(200);

    expect(t.driver.statements.length).toBe(before);
    const pages = await server().get('/api/admin/pages').set(admin).expect(200);
    // Only the main page, which the listing creates when there is none.
    expect((pages.body as { title: string }[]).map((p) => p.title)).not.toContain('Draft');
    expect(pages.body).toHaveLength(1);
  });

  it('answers 404, sandboxed, for an unknown or expired link', async () => {
    const path = await link();
    clock.advance(PREVIEW_TTL_MS);

    const expired = await server().get(path).expect(404);
    expect(expired.text).toContain('no longer available');
    expect(expired.text).not.toContain('Hello');
    expect(expired.headers['content-security-policy']).toMatch(/^sandbox /);
    await server().get('/api/preview/not-a-token').expect(404);
  });

  it('still previews a template that fails to render, as the error it would show', async () => {
    const response = await server()
      .get(await link({ ...draft, content: '<body>{{#if}}</body>' }))
      .expect(200);
    expect(response.text).toContain('could not be displayed');
    expect(response.text).toContain(PREVIEW_BANNER_TEXT);
  });

  it('refuses a body that is not a page', async () => {
    await server().post('/api/admin/pages/preview-link').set(admin).send({}).expect(400);
  });
});
