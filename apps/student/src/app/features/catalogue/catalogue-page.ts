import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { formatPrice, type CourseSummary } from '@speakukrainian/shared';
import { StudentApi } from '../../core/api';
import { errorMessage } from '../../core/http';
import { SessionStore } from '../../core/session.store';

/** The list of published courses; open to everyone. */
@Component({
  selector: 'app-catalogue-page',
  imports: [
    RouterLink,
    NzCardModule,
    NzButtonModule,
    NzTagModule,
    NzSpinModule,
    NzAlertModule,
    NzEmptyModule,
  ],
  template: `
    <div class="page-header"><h1>Courses</h1></div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon />
    }

    <nz-spin [nzSpinning]="loading()">
      <div class="grid">
        @for (course of courses(); track course.id) {
          <nz-card class="course" [nzTitle]="course.title">
            <p class="summary">{{ course.summary || 'No description yet.' }}</p>
            <p class="muted">
              {{ course.lessonCount }} {{ course.lessonCount === 1 ? 'lesson' : 'lessons' }}
            </p>
            <div class="foot">
              @if (session.ownedCourseIds().has(course.id)) {
                <nz-tag nzColor="green">Yours</nz-tag>
                <a nz-button nzType="primary" [routerLink]="['/my-courses', course.id]">Continue</a>
              } @else {
                <strong class="price">{{ price(course.priceCents, course.currency) }}</strong>
                <a nz-button [routerLink]="['/courses', course.slug]">View course</a>
              }
            </div>
          </nz-card>
        }
      </div>
      @if (!loading() && courses().length === 0 && !error()) {
        <nz-empty nzNotFoundContent="No courses are available yet. Check back soon." />
      }
    </nz-spin>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .course {
      display: flex;
      flex-direction: column;
    }
    .summary {
      min-height: 44px;
      white-space: pre-line;
    }
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 12px;
    }
    .price {
      font-size: 16px;
    }
  `,
})
export class CataloguePage {
  private readonly api = inject(StudentApi);
  protected readonly session = inject(SessionStore);

  protected readonly courses = signal<CourseSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly price = formatPrice;

  constructor() {
    void this.session.refreshCourses();
    firstValueFrom(this.api.courses())
      .then(
        (courses) => this.courses.set(courses),
        (error: unknown) => this.error.set(errorMessage(error, 'The courses could not be loaded.')),
      )
      .finally(() => this.loading.set(false));
  }
}
