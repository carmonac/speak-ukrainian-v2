import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CourseDetail,
  CourseOutline,
  CourseSection,
  CourseSummary,
  Currency,
  CourseStatus,
  SaveCourseInput,
} from '@speakukrainian/shared';
import {
  DatabaseService,
  isUniqueViolation,
  type Queryable,
} from '../infra/db/database.service.js';
import { H5pService } from '../h5p/h5p.service.js';

interface CourseRow {
  id: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  price_cents: number;
  currency: string;
  status: string;
  lesson_count: string;
}

interface TreeRow {
  section_id: string;
  section_title: string;
  lesson_id: string | null;
  lesson_title: string | null;
  intro_text: string | null;
  h5p_content_id: string | null;
  h5p_title: string | null;
}

const COURSE_SELECT = `
  select c.id, c.title, c.slug, c.summary, c.description, c.price_cents, c.currency, c.status,
         (select count(*) from public.lessons l
            join public.course_sections s on s.id = l.section_id
           where s.course_id = c.id) as lesson_count
  from public.courses c`;

export function toCourseSummary(row: CourseRow): CourseSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    priceCents: row.price_cents,
    currency: row.currency as Currency,
    status: row.status as CourseStatus,
    lessonCount: Number(row.lesson_count),
  };
}

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly h5p: H5pService,
  ) {}

  async list(onlyPublished = false): Promise<CourseSummary[]> {
    const rows = await this.db.rows<CourseRow>(
      `${COURSE_SELECT} ${onlyPublished ? `where c.status = 'published'` : ''} order by c.title`,
    );
    return rows.map(toCourseSummary);
  }

  async findById(id: string): Promise<CourseDetail> {
    const row = await this.db.one<CourseRow>(`${COURSE_SELECT} where c.id = $1`, [id]);
    if (!row) {
      throw new NotFoundException('That course does not exist.');
    }
    return { ...toCourseSummary(row), description: row.description, sections: await this.tree(id) };
  }

  /** What anyone may see of a published course: its outline, without the exercises. */
  async findPublishedOutline(slug: string): Promise<CourseOutline> {
    const row = await this.db.one<CourseRow>(
      `${COURSE_SELECT} where c.slug = $1 and c.status = 'published'`,
      [slug],
    );
    if (!row) {
      throw new NotFoundException('That course does not exist.');
    }
    const sections = await this.tree(row.id);
    return {
      ...toCourseSummary(row),
      description: row.description,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        lessons: section.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title })),
      })),
    };
  }

  async create(input: SaveCourseInput): Promise<CourseDetail> {
    const id = await this.guardSlug(() =>
      this.db.transaction(async (tx) => {
        const created = await tx.query<{ id: string }>(
          `insert into public.courses (title, slug, summary, description, price_cents, currency, status)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [
            input.title,
            input.slug,
            input.summary,
            input.description,
            input.priceCents,
            input.currency,
            input.status,
          ],
        );
        const courseId = created.rows[0]!.id;
        await this.writeTree(tx, courseId, input);
        return courseId;
      }),
    );
    return this.findById(id);
  }

  async update(id: string, input: SaveCourseInput): Promise<CourseDetail> {
    const before = await this.h5pIdsOf(id);

    await this.guardSlug(() =>
      this.db.transaction(async (tx) => {
        const updated = await tx.query(
          `update public.courses
           set title = $2, slug = $3, summary = $4, description = $5, price_cents = $6,
               currency = $7, status = $8
           where id = $1`,
          [
            id,
            input.title,
            input.slug,
            input.summary,
            input.description,
            input.priceCents,
            input.currency,
            input.status,
          ],
        );
        if (updated.rowCount === 0) {
          throw new NotFoundException('That course does not exist.');
        }
        await this.writeTree(tx, id, input);
      }),
    );

    await this.removeOrphanedExercises(before);
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const sold = await this.db.one(
      `select 1 from public.enrollments where course_id = $1
       union all select 1 from public.orders where course_id = $1 limit 1`,
      [id],
    );
    if (sold) {
      throw new ConflictException(
        'This course has students or sales and cannot be deleted. Set it to draft to hide it.',
      );
    }

    const before = await this.h5pIdsOf(id);
    const deleted = await this.db.query('delete from public.courses where id = $1', [id]);
    if (deleted.rowCount === 0) {
      throw new NotFoundException('That course does not exist.');
    }
    await this.removeOrphanedExercises(before);
  }

  /**
   * Points one lesson at an exercise (or at none), and deletes the exercise it
   * replaced if nothing else uses it. Used by the H5P editor screen, which
   * saves an exercise outside the course form.
   */
  async setLessonExercise(lessonId: string, h5pContentId: string | null): Promise<void> {
    const previous = await this.db.one<{ h5p_content_id: string | null }>(
      'select h5p_content_id from public.lessons where id = $1',
      [lessonId],
    );
    if (!previous) {
      throw new NotFoundException('That lesson does not exist.');
    }
    await this.guardSlug(() =>
      this.db.query('update public.lessons set h5p_content_id = $2 where id = $1', [
        lessonId,
        h5pContentId,
      ]),
    );
    if (previous.h5p_content_id && previous.h5p_content_id !== h5pContentId) {
      await this.removeOrphanedExercises([previous.h5p_content_id]);
    }
  }

  /**
   * Makes the stored sections and lessons match `input`: rows with a known id
   * are updated in place (so student progress survives a rename or reorder),
   * rows without one are inserted, and stored rows the input omits are deleted.
   */
  private async writeTree(tx: Queryable, courseId: string, input: SaveCourseInput): Promise<void> {
    const existingSections = new Set(
      (
        await tx.query<{ id: string }>(
          'select id from public.course_sections where course_id = $1',
          [courseId],
        )
      ).rows.map((r) => r.id),
    );
    const existingLessons = new Set(
      (
        await tx.query<{ id: string }>(
          `select l.id from public.lessons l
           join public.course_sections s on s.id = l.section_id
           where s.course_id = $1`,
          [courseId],
        )
      ).rows.map((r) => r.id),
    );

    const keptSections: string[] = [];
    const keptLessons: string[] = [];

    for (const [sectionPosition, section] of input.sections.entries()) {
      let sectionId: string;
      if (section.id && existingSections.has(section.id)) {
        sectionId = section.id;
        await tx.query(
          'update public.course_sections set title = $2, position = $3 where id = $1',
          [sectionId, section.title, sectionPosition],
        );
      } else {
        const inserted = await tx.query<{ id: string }>(
          `insert into public.course_sections (course_id, title, position) values ($1, $2, $3)
           returning id`,
          [courseId, section.title, sectionPosition],
        );
        sectionId = inserted.rows[0]!.id;
      }
      keptSections.push(sectionId);

      for (const [lessonPosition, lesson] of section.lessons.entries()) {
        if (lesson.id && existingLessons.has(lesson.id)) {
          await tx.query(
            `update public.lessons
             set section_id = $2, title = $3, intro_text = $4, h5p_content_id = $5, position = $6
             where id = $1`,
            [
              lesson.id,
              sectionId,
              lesson.title,
              lesson.introText,
              lesson.h5pContentId,
              lessonPosition,
            ],
          );
          keptLessons.push(lesson.id);
        } else {
          const inserted = await tx.query<{ id: string }>(
            `insert into public.lessons (section_id, title, intro_text, h5p_content_id, position)
             values ($1, $2, $3, $4, $5) returning id`,
            [sectionId, lesson.title, lesson.introText, lesson.h5pContentId, lessonPosition],
          );
          keptLessons.push(inserted.rows[0]!.id);
        }
      }
    }

    // Lessons first: a lesson moved to another section must not be cascaded
    // away with the section it left.
    await tx.query(
      `delete from public.lessons l using public.course_sections s
       where s.id = l.section_id and s.course_id = $1 and not (l.id = any($2::uuid[]))`,
      [courseId, keptLessons],
    );
    await tx.query(
      'delete from public.course_sections where course_id = $1 and not (id = any($2::uuid[]))',
      [courseId, keptSections],
    );
  }

  private async tree(courseId: string): Promise<CourseSection[]> {
    const rows = await this.db.rows<TreeRow>(
      `select s.id as section_id, s.title as section_title,
              l.id as lesson_id, l.title as lesson_title, l.intro_text, l.h5p_content_id,
              h.title as h5p_title
       from public.course_sections s
       left join public.lessons l on l.section_id = s.id
       left join public.h5p_content h on h.id = l.h5p_content_id
       where s.course_id = $1
       order by s.position, l.position`,
      [courseId],
    );

    const sections = new Map<string, CourseSection>();
    for (const row of rows) {
      const section = sections.get(row.section_id) ?? {
        id: row.section_id,
        title: row.section_title,
        lessons: [],
      };
      if (row.lesson_id) {
        section.lessons.push({
          id: row.lesson_id,
          title: row.lesson_title ?? '',
          introText: row.intro_text ?? '',
          h5pContentId: row.h5p_content_id,
          h5pTitle: row.h5p_title,
        });
      }
      sections.set(row.section_id, section);
    }
    return [...sections.values()];
  }

  private async h5pIdsOf(courseId: string): Promise<string[]> {
    const rows = await this.db.rows<{ h5p_content_id: string }>(
      `select distinct l.h5p_content_id
       from public.lessons l join public.course_sections s on s.id = l.section_id
       where s.course_id = $1 and l.h5p_content_id is not null`,
      [courseId],
    );
    return rows.map((r) => r.h5p_content_id);
  }

  /**
   * Deletes exercises that no lesson points at any more, so replacing or
   * removing a lesson's exercise does not leave its files in storage forever.
   * Best effort: a failure is logged and never fails the save.
   */
  private async removeOrphanedExercises(candidates: string[]): Promise<void> {
    if (candidates.length === 0) {
      return;
    }
    const stillUsed = new Set(
      (
        await this.db.rows<{ h5p_content_id: string }>(
          'select distinct h5p_content_id from public.lessons where h5p_content_id = any($1::uuid[])',
          [candidates],
        )
      ).map((r) => r.h5p_content_id),
    );
    for (const id of candidates) {
      if (stillUsed.has(id)) {
        continue;
      }
      await this.h5p
        .remove(id)
        .catch((error: unknown) =>
          this.logger.warn(`Could not remove orphaned exercise ${id}: ${String(error)}`),
        );
    }
  }

  private async guardSlug<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Another course already uses that URL name.');
      }
      if ((error as { code?: string } | null)?.code === '23503') {
        throw new ConflictException('A lesson refers to an exercise that no longer exists.');
      }
      throw error;
    }
  }
}
