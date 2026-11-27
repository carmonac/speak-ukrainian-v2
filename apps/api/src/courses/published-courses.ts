import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../infra/clock/clock.tokens.js';
import { CoursesService, type PublishedCourse } from './courses.service.js';

/** How long the list is served from memory before the database is asked again. */
export const PUBLISHED_COURSES_TTL_MS = 60_000;

/**
 * The published courses, as the public site's templates list them
 * (`{{#each courses}}`). Kept in memory for the same reason as `PageCache`:
 * the list changes only when the administrator saves a course, while every
 * visit to a page that shows it would otherwise read it.
 *
 * `clear()` is called by the course controller after every create, update and
 * delete, so an edit is visible on the next visit; the expiry bounds how long
 * another API instance could be behind.
 */
@Injectable()
export class PublishedCourses {
  private cached: { courses: PublishedCourse[]; expiresAt: number } | null = null;
  private loading: Promise<PublishedCourse[]> | null = null;
  private generation = 0;

  constructor(
    private readonly courses: CoursesService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(): Promise<PublishedCourse[]> {
    if (this.cached && this.cached.expiresAt > this.clock.now()) {
      return this.cached.courses;
    }
    if (this.loading) {
      return this.loading;
    }
    const generation = this.generation;
    const load = this.courses
      .listPublished()
      .then((courses) => {
        if (generation === this.generation) {
          this.cached = { courses, expiresAt: this.clock.now() + PUBLISHED_COURSES_TTL_MS };
        }
        return courses;
      })
      .finally(() => {
        if (this.loading === load) {
          this.loading = null;
        }
      });
    this.loading = load;
    return load;
  }

  clear(): void {
    this.generation += 1;
    this.cached = null;
    this.loading = null;
  }
}
