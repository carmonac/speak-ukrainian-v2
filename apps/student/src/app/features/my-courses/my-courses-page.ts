import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import type { MyCourseSummary } from '@speakukrainian/shared';
import { StudentApi } from '../../core/api';
import { errorMessage } from '../../core/http';
import { SessionStore } from '../../core/session.store';

@Component({
  selector: 'app-my-courses-page',
  imports: [
    RouterLink,
    NzCardModule,
    NzButtonModule,
    NzProgressModule,
    NzSpinModule,
    NzAlertModule,
    NzEmptyModule,
  ],
  template: `
    <div class="page-header"><h1>My courses</h1></div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon />
    }

    <nz-spin [nzSpinning]="loading()">
      <div class="grid">
        @for (course of courses(); track course.id) {
          <nz-card [nzTitle]="course.title">
            <p class="summary">{{ course.summary }}</p>
            <nz-progress [nzPercent]="course.progressPercent" />
            <p class="muted">
              {{ course.completedLessons }} of {{ course.lessonCount }} lessons completed
            </p>
            <a nz-button nzType="primary" [routerLink]="['/my-courses', course.id]">
              {{ course.completedLessons === 0 ? 'Start' : 'Continue' }}
            </a>
          </nz-card>
        }
      </div>
      @if (!loading() && courses().length === 0 && !error()) {
        <nz-empty nzNotFoundContent="You do not have any course yet." [nzNotFoundFooter]="browse" />
        <ng-template #browse>
          <a nz-button nzType="primary" routerLink="/courses">Browse courses</a>
        </ng-template>
      }
    </nz-spin>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .summary {
      min-height: 22px;
      white-space: pre-line;
    }
  `,
})
export class MyCoursesPage {
  private readonly api = inject(StudentApi);
  private readonly session = inject(SessionStore);

  protected readonly courses = signal<MyCourseSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    firstValueFrom(this.api.myCourses())
      .then(
        (courses) => {
          this.courses.set(courses);
          this.session.courses.set(courses);
        },
        (error: unknown) =>
          this.error.set(errorMessage(error, 'Your courses could not be loaded.')),
      )
      .finally(() => this.loading.set(false));
  }
}
