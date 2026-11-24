import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { SaveCourseInput } from '@speakukrainian/shared';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import type { H5pService } from '../h5p/h5p.service.js';
import { CoursesService } from './courses.service.js';

function course(overrides: Partial<SaveCourseInput> = {}): SaveCourseInput {
  return {
    title: 'Ukrainian A1',
    slug: 'ukrainian-a1',
    summary: 'Start here',
    description: 'The long text',
    priceCents: 2500,
    currency: 'eur',
    status: 'published',
    sections: [],
    ...overrides,
  };
}

const lesson = (title: string, extra: { id?: string; h5pContentId?: string | null } = {}) => ({
  title,
  introText: `About ${title}`,
  h5pContentId: null,
  ...extra,
});

describe('CoursesService', () => {
  let t: TestDatabase;
  let removed: string[];
  let service: CoursesService;

  const count = (table: string) => t.all<{ n: number }>(`select count(*) as n from ${table}`)[0]!.n;
  const addExercise = (id: string) =>
    t.all(
      `insert into h5p_content (id, title, main_library, storage_path) values (?, ?, 'H5P.X 1.0', ?) returning id`,
      id,
      `Exercise ${id}`,
      `h5p/content/${id}`,
    );

  beforeEach(() => {
    t = createTestDatabase();
    removed = [];
    const h5p = { remove: async (id: string) => void removed.push(id) } as unknown as H5pService;
    service = new CoursesService(t.db, h5p);
  });

  it('creates a course with its sections and lessons, in order', async () => {
    addExercise('ex-1');
    const created = await service.create(
      course({
        sections: [
          {
            title: 'Basics',
            lessons: [lesson('Alphabet', { h5pContentId: 'ex-1' }), lesson('Hello')],
          },
          { title: 'Empty', lessons: [] },
        ],
      }),
    );

    expect(created).toMatchObject({
      title: 'Ukrainian A1',
      slug: 'ukrainian-a1',
      summary: 'Start here',
      description: 'The long text',
      priceCents: 2500,
      currency: 'eur',
      status: 'published',
      lessonCount: 2,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.sections.map((s) => s.title)).toEqual(['Basics', 'Empty']);
    expect(created.sections[0]!.lessons).toEqual([
      {
        id: expect.any(String),
        title: 'Alphabet',
        introText: 'About Alphabet',
        h5pContentId: 'ex-1',
        h5pTitle: 'Exercise ex-1',
      },
      {
        id: expect.any(String),
        title: 'Hello',
        introText: 'About Hello',
        h5pContentId: null,
        h5pTitle: null,
      },
    ]);
  });

  it('lists courses with a numeric lesson count, and can list only published ones', async () => {
    await service.create(course({ sections: [{ title: 'S', lessons: [lesson('L')] }] }));
    await service.create(course({ title: 'Draft', slug: 'draft', status: 'draft' }));

    const all = await service.list();
    expect(all.map((c) => [c.title, c.lessonCount])).toEqual([
      ['Draft', 0],
      ['Ukrainian A1', 1],
    ]);
    expect((await service.list(true)).map((c) => c.slug)).toEqual(['ukrainian-a1']);
  });

  it('shows the outline of a published course without exercises, and hides drafts', async () => {
    await service.create(course({ sections: [{ title: 'S', lessons: [lesson('L')] }] }));
    await service.create(course({ title: 'Draft', slug: 'draft', status: 'draft' }));

    const outline = await service.findPublishedOutline('ukrainian-a1');
    expect(outline.sections).toEqual([
      { id: expect.any(String), title: 'S', lessons: [{ id: expect.any(String), title: 'L' }] },
    ]);
    await expect(service.findPublishedOutline('draft')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates in place: kept rows keep their ids, a lesson can change section, omitted rows go', async () => {
    const created = await service.create(
      course({
        sections: [
          { title: 'One', lessons: [lesson('A'), lesson('B')] },
          { title: 'Two', lessons: [lesson('C')] },
        ],
      }),
    );
    const [one, two] = created.sections;
    const [a, b] = one!.lessons;

    const updated = await service.update(
      created.id,
      course({
        title: 'Renamed',
        sections: [
          // Section "One" is dropped; its lesson A moves to "Two", B is removed.
          {
            id: two!.id,
            title: 'Two again',
            lessons: [lesson('A moved', { id: a!.id }), lesson('New')],
          },
        ],
      }),
    );

    expect(updated.title).toBe('Renamed');
    expect(updated.sections).toHaveLength(1);
    expect(updated.sections[0]).toMatchObject({ id: two!.id, title: 'Two again' });
    expect(updated.sections[0]!.lessons.map((l) => l.title)).toEqual(['A moved', 'New']);
    expect(updated.sections[0]!.lessons[0]!.id).toBe(a!.id);
    expect(t.all('select id from lessons where id = ?', b!.id)).toEqual([]);
    expect(count('course_sections')).toBe(1);
  });

  it('saves a course with more than 100 lessons, and updates it', async () => {
    const lessons = Array.from({ length: 150 }, (_, i) => lesson(`Lesson ${i}`));
    const created = await service.create(course({ sections: [{ title: 'Big', lessons }] }));
    expect(created.lessonCount).toBe(150);

    // Keep all 150 by id and append one: the "kept" list is 151 ids long.
    const section = created.sections[0]!;
    const updated = await service.update(
      created.id,
      course({
        sections: [
          {
            id: section.id,
            title: 'Big',
            lessons: [
              ...section.lessons.map((l) => lesson(l.title, { id: l.id })),
              lesson('One more'),
            ],
          },
        ],
      }),
    );
    expect(updated.lessonCount).toBe(151);
    expect(updated.sections[0]!.lessons.map((l) => l.id).slice(0, 150)).toEqual(
      section.lessons.map((l) => l.id),
    );
    // No statement came near D1's limit of 100 parameters.
    expect(Math.max(...t.driver.statements.map((s) => s.params?.length ?? 0))).toBeLessThan(20);
  });

  it('refuses a duplicate slug and writes nothing', async () => {
    await service.create(course());
    await expect(
      service.create(
        course({ title: 'Clash', sections: [{ title: 'S', lessons: [lesson('L')] }] }),
      ),
    ).rejects.toThrow(new ConflictException('Another course already uses that URL name.'));
    expect(count('courses')).toBe(1);
    expect(count('course_sections')).toBe(0);
  });

  it('rolls the whole update back when a later statement fails', async () => {
    const created = await service.create(
      course({ sections: [{ title: 'Kept', lessons: [lesson('Kept lesson')] }] }),
    );

    // The course row and the first section are valid; the lesson points at an
    // exercise that does not exist, which fails part-way through the batch.
    await expect(
      service.update(
        created.id,
        course({
          title: 'Should not stick',
          sections: [
            { title: 'New section', lessons: [lesson('Bad', { h5pContentId: 'missing' })] },
          ],
        }),
      ),
    ).rejects.toThrow(
      new ConflictException('A lesson refers to an exercise that no longer exists.'),
    );

    const after = await service.findById(created.id);
    expect(after.title).toBe('Ukrainian A1');
    expect(after.sections.map((s) => s.title)).toEqual(['Kept']);
    expect(after.sections[0]!.lessons.map((l) => l.title)).toEqual(['Kept lesson']);
  });

  it('answers 404 for a course that does not exist', async () => {
    await expect(service.findById('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('nope', course())).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an unsold course with its tree and its now-unused exercises', async () => {
    addExercise('ex-1');
    const created = await service.create(
      course({ sections: [{ title: 'S', lessons: [lesson('L', { h5pContentId: 'ex-1' })] }] }),
    );
    await service.remove(created.id);
    expect(count('courses') + count('course_sections') + count('lessons')).toBe(0);
    expect(removed).toEqual(['ex-1']);
  });

  it('refuses to delete a course that has students', async () => {
    const created = await service.create(course());
    t.addUser('u1');
    t.all(
      `insert into enrollments (user_id, course_id) values ('u1', ?) returning user_id`,
      created.id,
    );
    await expect(service.remove(created.id)).rejects.toBeInstanceOf(ConflictException);
    expect(count('courses')).toBe(1);
  });

  it('removes an exercise only when the update left no lesson using it', async () => {
    addExercise('shared');
    addExercise('solo');
    const created = await service.create(
      course({
        sections: [
          {
            title: 'S',
            lessons: [
              lesson('A', { h5pContentId: 'shared' }),
              lesson('B', { h5pContentId: 'shared' }),
              lesson('C', { h5pContentId: 'solo' }),
            ],
          },
        ],
      }),
    );
    const [a, b, c] = created.sections[0]!.lessons;
    await service.update(
      created.id,
      course({
        sections: [
          {
            id: created.sections[0]!.id,
            title: 'S',
            lessons: [
              lesson('A', { id: a!.id, h5pContentId: null }),
              lesson('B', { id: b!.id, h5pContentId: 'shared' }),
              lesson('C', { id: c!.id, h5pContentId: null }),
            ],
          },
        ],
      }),
    );
    expect(removed).toEqual(['solo']);
  });

  it('points a lesson at another exercise and cleans up the one it replaced', async () => {
    addExercise('old');
    addExercise('new');
    const created = await service.create(
      course({ sections: [{ title: 'S', lessons: [lesson('L', { h5pContentId: 'old' })] }] }),
    );
    const lessonId = created.sections[0]!.lessons[0]!.id;

    await service.setLessonExercise(lessonId, 'new');
    expect(t.all('select h5p_content_id from lessons')).toEqual([{ h5p_content_id: 'new' }]);
    expect(removed).toEqual(['old']);

    await expect(service.setLessonExercise(lessonId, 'ghost')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.setLessonExercise('nope', null)).rejects.toBeInstanceOf(NotFoundException);
  });
});
