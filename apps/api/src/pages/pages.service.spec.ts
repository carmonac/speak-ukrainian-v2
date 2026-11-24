import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { SavePageInput } from '@speakukrainian/shared';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { PagesService } from './pages.service.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function page(overrides: Partial<SavePageInput> = {}): SavePageInput {
  return {
    title: 'About',
    path: '/about',
    content: '<h1>{{ heading }}</h1>',
    texts: [
      {
        key: 'heading',
        translations: [
          { locale: 'en', value: 'About us' },
          { locale: 'es', value: 'Sobre nosotros' },
        ],
      },
      { key: 'empty', translations: [] },
    ],
    ...overrides,
  };
}

describe('PagesService', () => {
  let t: TestDatabase;
  let service: PagesService;

  const count = (table: string) => t.all<{ n: number }>(`select count(*) as n from ${table}`)[0]!.n;

  beforeEach(() => {
    t = createTestDatabase();
    service = new PagesService(t.db);
  });

  it('serves the seeded main page at /', async () => {
    const main = await service.findMain();
    expect(main).toMatchObject({ title: 'SpeakUkrainian', path: '/', isMain: true });
    expect(main.updatedAt).toMatch(ISO);
    expect(main.texts.map((x) => x.key)).toEqual(['header', 'intro', 'classroom_link']);
    expect(main.texts[0]!.translations).toEqual([
      { locale: 'en', value: 'Learn Ukrainian' },
      { locale: 'es', value: 'Aprende ucraniano' },
    ]);
    expect((await service.findByPath('/'))?.id).toBe(main.id);
  });

  it('creates a page with texts and translations in order', async () => {
    const created = await service.create(page());
    expect(created).toMatchObject({
      title: 'About',
      path: '/about',
      isMain: false,
      content: '<h1>{{ heading }}</h1>',
      texts: page().texts,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await service.findByPath('/about'))?.id).toBe(created.id);
    expect(await service.findByPath('/missing')).toBeNull();
    expect(await service.count()).toBe(2);
  });

  it('lists the main page first, then by title', async () => {
    await service.create(page({ title: 'Zebra', path: '/z' }));
    await service.create(page({ title: 'Apple', path: '/a' }));
    expect((await service.list()).map((p) => p.title)).toEqual([
      'SpeakUkrainian',
      'Apple',
      'Zebra',
    ]);
  });

  it('refuses a duplicate path and leaves no orphan texts', async () => {
    await service.create(page());
    const texts = count('page_texts');
    await expect(service.create(page({ title: 'Again' }))).rejects.toThrow(
      new ConflictException('Another page already uses that URL path.'),
    );
    expect(count('pages')).toBe(2);
    expect(count('page_texts')).toBe(texts);
  });

  it('replaces the texts on update and refreshes updated_at', async () => {
    const created = await service.create(page());
    t.all(
      `update pages set updated_at = '2020-01-01T00:00:00.000Z' where id = ? returning id`,
      created.id,
    );

    const updated = await service.update(
      created.id,
      page({
        title: 'About 2',
        texts: [{ key: 'only', translations: [{ locale: 'uk', value: 'Про нас' }] }],
      }),
    );
    expect(updated.title).toBe('About 2');
    expect(updated.texts).toEqual([
      { key: 'only', translations: [{ locale: 'uk', value: 'Про нас' }] },
    ]);
    expect(updated.updatedAt > '2020-01-01T00:00:00.000Z').toBe(true);
    // Texts of the seeded main page are untouched.
    expect((await service.findMain()).texts).toHaveLength(3);
  });

  it('rolls an update back when the new path is taken: the old texts survive', async () => {
    await service.create(page({ title: 'Taken', path: '/taken', texts: [] }));
    const created = await service.create(page());

    await expect(
      service.update(created.id, page({ path: '/taken', texts: [] })),
    ).rejects.toBeInstanceOf(ConflictException);

    const after = await service.findById(created.id);
    expect(after.path).toBe('/about');
    expect(after.texts).toEqual(page().texts);
  });

  it('answers 404 for an unknown page and refuses to delete the main page', async () => {
    await expect(service.findById('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('nope', page())).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);

    const main = await service.findMain();
    await expect(service.remove(main.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes a page together with its texts', async () => {
    const created = await service.create(page());
    await service.remove(created.id);
    expect(count('pages')).toBe(1);
    expect(count('page_texts')).toBe(3);
    expect(count('page_text_translations')).toBe(6);
  });
});
