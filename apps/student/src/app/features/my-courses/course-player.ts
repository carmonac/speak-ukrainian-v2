import { HttpErrorResponse } from '@angular/common/http';
import { TextFieldModule } from '@angular/cdk/text-field';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import type { Lesson, LessonProgress, MyCourseDetail } from '@speakukrainian/shared';
import { StudentApi } from '../../core/api';
import { errorMessage } from '../../core/http';
import { SessionStore } from '../../core/session.store';
import { ExerciseView } from '../../h5p/exercise-view';
import type { H5pResult } from '../../h5p/h5p-player';

/** How often, and how many times, to re-ask for a course just paid for. */
const CONFIRM_RETRY_MS = 2_500;
const CONFIRM_RETRIES = 8;

/**
 * Taking a course: the outline with progress on the left, the current lesson
 * and its exercise in the middle.
 */
@Component({
  selector: 'app-course-player',
  imports: [
    FormsModule,
    RouterLink,
    TextFieldModule,
    ExerciseView,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
    NzSpinModule,
    NzProgressModule,
    NzModalModule,
    NzInputModule,
  ],
  templateUrl: './course-player.html',
  styleUrl: './course-player.scss',
})
export class CoursePlayer {
  private readonly api = inject(StudentApi);
  private readonly session = inject(SessionStore);
  private readonly message = inject(NzMessageService);

  readonly courseId = input.required<string>();
  /** Absent on `/my-courses/:courseId`, which opens the first unfinished lesson. */
  readonly lessonId = input<string>();
  /** Query parameter Stripe's success URL carries. */
  readonly checkout = input<string>();

  protected readonly course = signal<MyCourseDetail | null>(null);
  protected readonly loading = signal(true);
  /** Paid, but the payment provider has not told us yet. */
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly progress = signal<ReadonlyMap<string, LessonProgress>>(new Map());
  protected readonly marking = signal(false);
  protected readonly justBought = signal(false);

  protected readonly askOpen = signal(false);
  protected readonly asking = signal(false);
  protected readonly asked = signal(false);
  protected question = '';

  protected readonly lessons = computed<Lesson[]>(
    () => this.course()?.sections.flatMap((section) => section.lessons) ?? [],
  );

  /**
   * Where the course opens when the URL names no lesson: the first lesson that
   * was not completed **when the course loaded**. Decided once, not derived
   * from live progress — otherwise finishing an exercise would swap it out
   * from under the student before they could read its feedback.
   */
  private readonly resumeLessonId = signal<string | null>(null);

  /** The lesson in the URL, else the one to resume at, else the first. */
  protected readonly current = computed<Lesson | null>(() => {
    const lessons = this.lessons();
    const wanted = this.lessonId() ?? this.resumeLessonId();
    return lessons.find((lesson) => lesson.id === wanted) ?? lessons[0] ?? null;
  });

  private readonly currentIndex = computed(() => {
    const current = this.current();
    return current ? this.lessons().findIndex((lesson) => lesson.id === current.id) : -1;
  });
  protected readonly previous = computed(() => this.lessons()[this.currentIndex() - 1] ?? null);
  protected readonly next = computed(() => {
    const index = this.currentIndex();
    return index < 0 ? null : (this.lessons()[index + 1] ?? null);
  });

  protected readonly currentProgress = computed(() => {
    const current = this.current();
    return current ? (this.progress().get(current.id) ?? null) : null;
  });

  protected readonly percent = computed(() => {
    const lessons = this.lessons();
    if (lessons.length === 0) {
      return 0;
    }
    const progress = this.progress();
    const done = lessons.filter((lesson) => progress.get(lesson.id)?.completed).length;
    return Math.round((done / lessons.length) * 100);
  });

  /** The last result sent per lesson, to drop H5P's repeated statements. */
  private readonly lastSent = new Map<string, string>();

  constructor() {
    effect((onCleanup) => {
      const courseId = this.courseId();
      const afterCheckout = untracked(() => this.checkout()) === 'success';
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      untracked(() => {
        this.course.set(null);
        this.progress.set(new Map());
        this.error.set(null);
        this.loading.set(true);
        this.confirming.set(false);
        this.justBought.set(afterCheckout);
      });

      const attempt = (remaining: number): void => {
        firstValueFrom(this.api.myCourse(courseId)).then(
          (course) => {
            if (cancelled) {
              return;
            }
            const done = new Set(course.progress.filter((p) => p.completed).map((p) => p.lessonId));
            this.resumeLessonId.set(
              course.sections.flatMap((section) => section.lessons).find((l) => !done.has(l.id))
                ?.id ?? null,
            );
            this.course.set(course);
            this.progress.set(new Map(course.progress.map((p) => [p.lessonId, p])));
            this.confirming.set(false);
            this.loading.set(false);
            void this.session.refreshCourses();
          },
          (error: unknown) => {
            if (cancelled) {
              return;
            }
            // Back from the payment page before its confirmation reached the
            // server: the course is not ours *yet*. Ask again for a while.
            const notOwnedYet = error instanceof HttpErrorResponse && error.status === 403;
            if (afterCheckout && notOwnedYet && remaining > 0) {
              this.confirming.set(true);
              timer = setTimeout(() => attempt(remaining - 1), CONFIRM_RETRY_MS);
              return;
            }
            this.confirming.set(false);
            this.loading.set(false);
            this.error.set(
              afterCheckout && notOwnedYet
                ? 'Your payment has not been confirmed yet. Reload this page in a minute; if the course still does not open, write to us.'
                : notOwnedYet
                  ? 'You do not own this course.'
                  : errorMessage(error, 'The course could not be loaded.'),
            );
          },
        );
      };
      attempt(CONFIRM_RETRIES);

      onCleanup(() => {
        cancelled = true;
        if (timer) {
          clearTimeout(timer);
        }
      });
    });
  }

  protected isCompleted(lessonId: string): boolean {
    return this.progress().get(lessonId)?.completed === true;
  }

  protected scoreOf(lessonId: string): string | null {
    const progress = this.progress().get(lessonId);
    return progress ? scoreLabel(progress) : null;
  }

  protected scoreLabel = scoreLabel;

  /** The exercise reported an outcome. */
  protected onResult(lesson: Lesson, result: H5pResult): void {
    const key = `${result.score ?? ''}/${result.maxScore ?? ''}`;
    if (this.lastSent.get(lesson.id) === key) {
      return;
    }
    this.lastSent.set(lesson.id, key);
    void this.record(lesson.id, result.score, result.maxScore);
  }

  /** For lessons with no exercise, completion is the student's word. */
  protected async markComplete(lesson: Lesson): Promise<void> {
    if (this.marking()) {
      return;
    }
    this.marking.set(true);
    await this.record(lesson.id, null, null);
    this.marking.set(false);
  }

  private async record(
    lessonId: string,
    score: number | null,
    maxScore: number | null,
  ): Promise<void> {
    try {
      const saved = await firstValueFrom(
        this.api.recordResult(lessonId, { completed: true, score, maxScore }),
      );
      const wasCompleted = this.isCompleted(lessonId);
      this.progress.update((map) => new Map(map).set(lessonId, saved));
      if (!wasCompleted) {
        this.message.success('Lesson completed');
        void this.session.refreshCourses();
      }
    } catch (error) {
      // Allow the same result to be sent again on the next statement.
      this.lastSent.delete(lessonId);
      this.message.error(errorMessage(error, 'Your progress could not be saved.'));
    }
  }

  protected openAsk(): void {
    this.question = '';
    this.asked.set(false);
    this.askOpen.set(true);
  }

  protected async ask(lesson: Lesson): Promise<void> {
    const body = this.question.trim();
    if (!body || this.asking()) {
      return;
    }
    this.asking.set(true);
    try {
      await firstValueFrom(this.api.sendMessage(body, lesson.id));
      this.asked.set(true);
      this.question = '';
    } catch (error) {
      this.message.error(errorMessage(error, 'Your question could not be sent.'));
    } finally {
      this.asking.set(false);
    }
  }
}

function scoreLabel(progress: LessonProgress): string | null {
  if (progress.score === null || progress.maxScore === null || progress.maxScore === 0) {
    return null;
  }
  return `${trim(progress.score)} / ${trim(progress.maxScore)}`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
