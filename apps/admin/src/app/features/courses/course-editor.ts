import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import {
  MAX_H5P_UPLOAD_BYTES,
  h5pUploadTooLargeMessage,
  isH5pPackageFilename,
  notAnH5pPackageMessage,
  saveCourseSchema,
  type CourseDetail,
  type CourseStatus,
  type Currency,
  type SaveCourseInput,
} from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { errorMessage } from '../../core/http';
import { NavStore } from '../../core/nav.store';
import { ExercisePreview } from '../../h5p/exercise-preview';
import { H5pApi } from '../../h5p/h5p.api';

interface LessonForm {
  id?: string;
  title: string;
  introText: string;
  h5pContentId: string | null;
  h5pTitle: string | null;
  uploading?: boolean;
}
interface SectionForm {
  id?: string;
  title: string;
  lessons: LessonForm[];
}
interface CourseForm {
  title: string;
  slug: string;
  summary: string;
  description: string;
  /** In major units (euros), as the administrator types it. */
  price: number;
  currency: Currency;
  status: CourseStatus;
  sections: SectionForm[];
}

function emptyForm(): CourseForm {
  return {
    title: '',
    slug: '',
    summary: '',
    description: '',
    price: 0,
    currency: 'eur',
    status: 'draft',
    sections: [{ title: 'Section 1', lessons: [] }],
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Creates and edits one course: its details, price, sections and H5P lessons. */
@Component({
  selector: 'app-course-editor',
  imports: [
    FormsModule,
    TextFieldModule,
    ExercisePreview,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
    NzSpinModule,
    NzTagModule,
    NzModalModule,
    NzPopconfirmModule,
    NzTooltipModule,
  ],
  templateUrl: './course-editor.html',
  styleUrl: './course-editor.scss',
})
export class CourseEditor {
  private readonly api = inject(AdminApi);
  private readonly h5p = inject(H5pApi);
  private readonly nav = inject(NavStore);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  /** Route parameter; absent on `/courses/new`. */
  readonly id = input<string>();

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly course = signal<CourseDetail | null>(null);
  protected readonly form = signal<CourseForm>(emptyForm());
  protected readonly previewing = signal<LessonForm | null>(null);
  /** Until the administrator edits the URL name by hand, it follows the title. */
  private slugTouched = false;

  protected readonly heading = computed(() => this.course()?.title ?? 'Add course');

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  private async load(id: string | undefined): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.course.set(null);
    this.slugTouched = id !== undefined;

    if (id === undefined) {
      this.form.set(emptyForm());
      this.loading.set(false);
      return;
    }
    try {
      this.apply(await firstValueFrom(this.api.course(id)));
    } catch (error) {
      this.error.set(errorMessage(error, 'The course could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  private apply(course: CourseDetail): void {
    this.course.set(course);
    this.form.set({
      title: course.title,
      slug: course.slug,
      summary: course.summary,
      description: course.description,
      price: course.priceCents / 100,
      currency: course.currency,
      status: course.status,
      sections: course.sections.map((section) => ({
        id: section.id,
        title: section.title,
        lessons: section.lessons.map((lesson) => ({ ...lesson })),
      })),
    });
  }

  protected onTitleChange(title: string): void {
    const form = this.form();
    form.title = title;
    if (!this.slugTouched) {
      form.slug = slugify(title);
    }
  }

  protected onSlugChange(slug: string): void {
    this.slugTouched = true;
    this.form().slug = slug;
  }

  protected addSection(): void {
    const sections = this.form().sections;
    sections.push({ title: `Section ${sections.length + 1}`, lessons: [] });
  }

  protected addLesson(section: SectionForm): void {
    section.lessons.push({
      title: `Lesson ${section.lessons.length + 1}`,
      introText: '',
      h5pContentId: null,
      h5pTitle: null,
    });
  }

  protected move<T>(list: T[], index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= list.length) {
      return;
    }
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item as T);
  }

  protected remove<T>(list: T[], index: number): void {
    list.splice(index, 1);
  }

  private payload(): SaveCourseInput | null {
    const form = this.form();
    const parsed = saveCourseSchema.safeParse({
      title: form.title,
      slug: form.slug.trim(),
      summary: form.summary,
      description: form.description,
      priceCents: Math.round((form.price ?? 0) * 100),
      currency: form.currency,
      status: form.status,
      sections: form.sections.map((section) => ({
        ...(section.id ? { id: section.id } : {}),
        title: section.title,
        lessons: section.lessons.map((lesson) => ({
          ...(lesson.id ? { id: lesson.id } : {}),
          title: lesson.title,
          introText: lesson.introText,
          h5pContentId: lesson.h5pContentId,
        })),
      })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      this.error.set(
        issue ? `${issue.path.join('.') || 'Form'}: ${issue.message}` : 'Check the form.',
      );
      return null;
    }
    return parsed.data;
  }

  /** Saves and returns the stored course, or null when it could not be saved. */
  protected async save(stay = false): Promise<CourseDetail | null> {
    const payload = this.payload();
    if (!payload || this.saving()) {
      return null;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const existing = this.course();
      const saved = existing
        ? await firstValueFrom(this.api.updateCourse(existing.id, payload))
        : await firstValueFrom(this.api.createCourse(payload));
      void this.nav.refreshCourses();
      this.message.success('Course saved');
      if (existing || stay) {
        this.apply(saved);
      }
      if (!existing && !stay) {
        await this.router.navigate(['/courses', saved.id]);
      }
      return saved;
    } catch (error) {
      this.error.set(errorMessage(error, 'The course could not be saved.'));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeCourse(): Promise<void> {
    const course = this.course();
    if (!course) {
      return;
    }
    try {
      await firstValueFrom(this.api.deleteCourse(course.id));
      this.message.success('Course deleted');
      void this.nav.refreshCourses();
      await this.router.navigate(['/']);
    } catch (error) {
      this.error.set(errorMessage(error, 'The course could not be deleted.'));
    }
  }

  /** Uploads a `.h5p` package and attaches it to the lesson (saved with the course). */
  protected async onPackageChosen(lesson: LessonForm, event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';
    if (!file) {
      return;
    }
    if (!isH5pPackageFilename(file.name)) {
      this.message.error(notAnH5pPackageMessage(file.name));
      return;
    }
    if (file.size > MAX_H5P_UPLOAD_BYTES) {
      this.message.error(h5pUploadTooLargeMessage());
      return;
    }

    lesson.uploading = true;
    try {
      const result = await firstValueFrom(this.h5p.uploadPackage(file));
      lesson.h5pContentId = result.contentId;
      lesson.h5pTitle = result.title;
      this.message.success(`"${result.title}" uploaded. Save the course to keep it.`);
    } catch (error) {
      this.message.error(errorMessage(error, 'The package could not be uploaded.'));
    } finally {
      lesson.uploading = false;
      // The upload finished outside any template event; tell the view.
      this.form.update((form) => ({ ...form }));
    }
  }

  /**
   * Opens the H5P editor for a lesson. The course is saved first, both so the
   * lesson has an id to attach the exercise to and so nothing typed here is
   * lost: the editor is opened with a full page load, because Joubel's editor
   * can only be started once per document.
   */
  protected async openExerciseEditor(sectionIndex: number, lessonIndex: number): Promise<void> {
    const saved = await this.save(true);
    const lesson = saved?.sections[sectionIndex]?.lessons[lessonIndex];
    if (!saved || !lesson) {
      return;
    }
    window.location.assign(`/courses/${saved.id}/lessons/${lesson.id}/exercise`);
  }

  protected detachExercise(lesson: LessonForm): void {
    lesson.h5pContentId = null;
    lesson.h5pTitle = null;
  }
}
