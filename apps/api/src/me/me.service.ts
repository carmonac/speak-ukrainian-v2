import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LessonProgress,
  LessonResultInput,
  MyCourseDetail,
  MyCourseSummary,
  MyProfile,
  UpdateMyProfileInput,
} from '@speakukrainian/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CoursesService, toCourseSummary } from '../courses/courses.service.js';
import { DatabaseService, now } from '../infra/db/database.service.js';
import { percent } from '../users/users.service.js';

/** Everything a signed-in student does with their own account and courses. */
@Injectable()
export class MeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly courses: CoursesService,
  ) {}

  async profile(user: AuthenticatedUser): Promise<MyProfile> {
    const row = await this.db.one<{ full_name: string; locale: string }>(
      'select full_name, locale from profiles where id = ?1',
      [user.uid],
    );
    return {
      id: user.uid,
      email: user.email ?? '',
      fullName: row?.full_name ?? '',
      locale: row?.locale ?? 'en',
    };
  }

  async updateProfile(user: AuthenticatedUser, input: UpdateMyProfileInput): Promise<MyProfile> {
    await this.db.query(
      `insert into profiles (id, full_name) values (?1, ?2)
       on conflict (id) do update set full_name = excluded.full_name`,
      [user.uid, input.fullName],
    );
    return this.profile(user);
  }

  async myCourses(userId: string): Promise<MyCourseSummary[]> {
    const rows = await this.db.rows<Parameters<typeof toCourseSummary>[0] & { completed: number }>(
      `select c.id, c.title, c.slug, c.summary, c.description, c.price_cents, c.currency, c.status,
              (select count(*) from lessons l
                 join course_sections s on s.id = l.section_id
                where s.course_id = c.id) as lesson_count,
              (select count(*) from lesson_progress lp
                 join lessons l on l.id = lp.lesson_id
                 join course_sections s on s.id = l.section_id
                where s.course_id = c.id and lp.user_id = e.user_id and lp.completed_at is not null) as completed
       from enrollments e
       join courses c on c.id = e.course_id
       where e.user_id = ?1
       order by e.created_at desc`,
      [userId],
    );
    return rows.map((row) => {
      const summary = toCourseSummary(row);
      const completedLessons = row.completed;
      return {
        ...summary,
        completedLessons,
        progressPercent: percent(completedLessons, summary.lessonCount),
      };
    });
  }

  /** The full course with its exercises, for a student who owns it. */
  async myCourse(userId: string, courseId: string): Promise<MyCourseDetail> {
    const enrolled = await this.db.one(
      'select 1 from enrollments where user_id = ?1 and course_id = ?2',
      [userId, courseId],
    );
    if (!enrolled) {
      throw new ForbiddenException('You do not own this course.');
    }

    const course = await this.courses.findById(courseId);
    const rows = await this.db.rows<{
      lesson_id: string;
      completed_at: string | null;
      score: number | null;
      max_score: number | null;
    }>(
      `select lp.lesson_id, lp.completed_at, lp.score, lp.max_score
       from lesson_progress lp
       join lessons l on l.id = lp.lesson_id
       join course_sections s on s.id = l.section_id
       where lp.user_id = ?1 and s.course_id = ?2`,
      [userId, courseId],
    );

    const progress: LessonProgress[] = rows.map((row) => ({
      lessonId: row.lesson_id,
      completed: row.completed_at !== null,
      score: row.score,
      maxScore: row.max_score,
      completedAt: row.completed_at,
    }));

    return {
      ...course,
      progress,
      progressPercent: percent(progress.filter((p) => p.completed).length, course.lessonCount),
    };
  }

  /**
   * Records the outcome of one exercise. A lesson, once completed, stays
   * completed, and the best score is kept, so retrying never loses progress.
   */
  async recordResult(
    userId: string,
    lessonId: string,
    result: LessonResultInput,
  ): Promise<LessonProgress> {
    const allowed = await this.db.one(
      `select 1
       from lessons l
       join course_sections s on s.id = l.section_id
       join enrollments e on e.course_id = s.course_id and e.user_id = ?2
       where l.id = ?1`,
      [lessonId, userId],
    );
    if (!allowed) {
      throw new NotFoundException('That lesson is not part of a course you own.');
    }

    const at = now();
    const row = await this.db.one<{
      completed_at: string | null;
      score: number | null;
      max_score: number | null;
    }>(
      // `is` is SQLite's null-safe equality: two missing maximums are equal.
      `insert into lesson_progress (user_id, lesson_id, completed_at, score, max_score, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6)
       on conflict (user_id, lesson_id) do update set
         completed_at = coalesce(lesson_progress.completed_at, excluded.completed_at),
         score = case
           when excluded.score is null then lesson_progress.score
           when lesson_progress.score is null then excluded.score
           when excluded.max_score is lesson_progress.max_score
             then max(lesson_progress.score, excluded.score)
           else excluded.score
         end,
         max_score = coalesce(excluded.max_score, lesson_progress.max_score),
         updated_at = excluded.updated_at
       returning completed_at, score, max_score`,
      [userId, lessonId, result.completed ? at : null, result.score, result.maxScore, at],
    );

    return {
      lessonId,
      completed: row!.completed_at !== null,
      score: row!.score,
      maxScore: row!.max_score,
      completedAt: row!.completed_at,
    };
  }
}
