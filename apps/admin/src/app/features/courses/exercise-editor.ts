import {
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import type { Lesson, SaveH5pContentInput } from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { errorMessage } from '../../core/http';
import { H5P_DEFINE_EDITOR_ELEMENT } from '../../h5p/h5p-elements';
import {
  H5P_NEW_CONTENT_ID,
  mountH5pEditor,
  type H5pEditorContent,
  type H5pEditorHost,
} from '../../h5p/h5p-mount';
import { H5pApi } from '../../h5p/h5p.api';

const SAVE_FAILED = 'The exercise could not be saved.';

/**
 * The H5P editor for one lesson's exercise.
 *
 * Reached with a full page load (see `CourseEditor.openExerciseEditor`), and
 * the route carries no query parameters: Joubel's editor appends
 * `location.search` to every request it makes.
 */
@Component({
  selector: 'app-exercise-editor',
  imports: [RouterLink, NzButtonModule, NzCardModule, NzIconModule, NzAlertModule, NzSpinModule],
  template: `
    <div class="page-header">
      <h1>{{ lesson()?.h5pContentId ? 'Edit exercise' : 'Create exercise' }}</h1>
      <div class="page-actions">
        <a nz-button [routerLink]="['/courses', courseId()]">
          <nz-icon nzType="arrow-left" />
          Back to course
        </a>
        <button
          nz-button
          nzType="primary"
          (click)="save()"
          [disabled]="!ready()"
          [nzLoading]="saving()"
        >
          <nz-icon nzType="save" />
          Save exercise
        </button>
      </div>
    </div>

    @if (lesson(); as current) {
      <p class="muted">Lesson: {{ current.title }}</p>
    }
    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }
    @if (!ready() && !error()) {
      <nz-alert nzType="info" [nzMessage]="waiting()" nzShowIcon class="alert" />
    }

    <nz-card>
      <nz-spin [nzSpinning]="loading()">
        <div #host class="host"></div>
      </nz-spin>
    </nz-card>
  `,
  styles: `
    .alert {
      margin-bottom: 16px;
    }
    .host {
      min-height: 420px;
    }
  `,
})
export class ExerciseEditor {
  private readonly api = inject(AdminApi);
  private readonly h5p = inject(H5pApi);
  private readonly router = inject(Router);

  readonly courseId = input.required<string>();
  readonly lessonId = input.required<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  protected readonly lesson = signal<Lesson | null>(null);
  protected readonly loading = signal(true);
  /** True once the widget can be saved: for a new exercise, after a content type is picked. */
  protected readonly ready = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly waiting = computed(() =>
    this.loading()
      ? 'Loading the editor…'
      : this.lesson()?.h5pContentId
        ? 'Loading the exercise…'
        : 'Choose a content type to start. Save becomes available once it has loaded.',
  );

  constructor() {
    inject(H5P_DEFINE_EDITOR_ELEMENT)();

    effect((onCleanup) => {
      const courseId = this.courseId();
      const lessonId = this.lessonId();
      const container = this.host().nativeElement;
      let cancelled = false;
      let teardown: (() => void) | null = null;

      void this.prepare(courseId, lessonId).then((prepared) => {
        if (cancelled || !prepared) {
          return;
        }
        this.loading.set(false);
        teardown = mountH5pEditor(container, {
          contentId: prepared.contentId ?? H5P_NEW_CONTENT_ID,
          content: prepared.content,
          save: (contentId, body) => this.persist(contentId, body),
          onReady: () => this.ready.set(true),
          onSaved: (contentId) => void this.finish(contentId),
          onError: (message) => this.error.set(message || SAVE_FAILED),
          onInvalid: (message) => this.error.set(message || SAVE_FAILED),
        });
      });

      onCleanup(() => {
        cancelled = true;
        teardown?.();
        this.ready.set(false);
      });
    });
  }

  /** Everything the widget needs is fetched before it is mounted. */
  private async prepare(
    courseId: string,
    lessonId: string,
  ): Promise<{ contentId: string | null; content: H5pEditorContent } | null> {
    try {
      const course = await firstValueFrom(this.api.course(courseId));
      const lesson = course.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
      if (!lesson) {
        throw new Error('That lesson no longer exists.');
      }
      this.lesson.set(lesson);

      const contentId = lesson.h5pContentId;
      if (contentId === null) {
        return { contentId, content: await firstValueFrom(this.h5p.editorModel()) };
      }
      const [model, parameters] = await Promise.all([
        firstValueFrom(this.h5p.editorModel(contentId)),
        firstValueFrom(this.h5p.contentParameters(contentId)),
      ]);
      return {
        contentId,
        content: {
          ...model,
          library: parameters.library,
          metadata: parameters.params.metadata,
          params: parameters.params.params,
        },
      };
    } catch (error) {
      this.error.set(errorMessage(error, 'The editor could not be loaded.'));
      this.loading.set(false);
      return null;
    }
  }

  protected async save(): Promise<void> {
    const element = this.host().nativeElement.querySelector<H5pEditorHost>('h5p-editor');
    if (element === null || !this.ready() || this.saving()) {
      return;
    }
    this.error.set(null);
    try {
      await (element.save?.() ?? Promise.reject(new Error(SAVE_FAILED)));
    } catch {
      this.error.update((current) => current ?? SAVE_FAILED);
    }
  }

  private async persist(
    contentId: string | undefined,
    body: SaveH5pContentInput,
  ): Promise<{ contentId: string }> {
    this.saving.set(true);
    try {
      const result = await firstValueFrom(this.h5p.save(contentId, body));
      return { contentId: result.contentId };
    } catch (error) {
      throw new Error(errorMessage(error, SAVE_FAILED), { cause: error });
    } finally {
      this.saving.set(false);
    }
  }

  /** The exercise is stored; point the lesson at it and return to the course. */
  private async finish(contentId: string): Promise<void> {
    try {
      await firstValueFrom(this.api.setLessonExercise(this.lessonId(), contentId));
      await this.router.navigate(['/courses', this.courseId()]);
    } catch (error) {
      this.error.set(
        errorMessage(error, 'The exercise was saved but could not be attached to the lesson.'),
      );
    }
  }
}
