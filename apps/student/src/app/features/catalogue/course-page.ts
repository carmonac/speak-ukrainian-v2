import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { formatPrice, type CourseOutline } from '@speakukrainian/shared';
import { StudentApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/http';
import { SessionStore } from '../../core/session.store';

/** A course before buying: description, outline, price and the buy button. */
@Component({
  selector: 'app-course-page',
  imports: [RouterLink, NzCardModule, NzButtonModule, NzIconModule, NzAlertModule, NzSpinModule],
  template: `
    <p>
      <a routerLink="/courses"><nz-icon nzType="arrow-left" /> All courses</a>
    </p>

    @if (checkout() === 'cancelled') {
      <nz-alert
        nzType="info"
        nzShowIcon
        nzCloseable
        nzMessage="The payment was cancelled. You have not been charged."
        class="alert"
      />
    }
    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }

    <nz-spin [nzSpinning]="loading()">
      @if (course(); as current) {
        <div class="layout">
          <div>
            <h1>{{ current.title }}</h1>
            @if (current.summary) {
              <!-- Sanitized by the API on save; Angular's sanitizer runs on it again. -->
              <div class="summary rich-text" [innerHTML]="current.summary"></div>
            }
            @if (current.description) {
              <nz-card nzTitle="About this course" class="block">
                <p class="description">{{ current.description }}</p>
              </nz-card>
            }

            <nz-card nzTitle="What you will learn" class="block">
              @for (section of current.sections; track section.id) {
                <h3 class="section">{{ section.title }}</h3>
                <ol class="lessons">
                  @for (lesson of section.lessons; track lesson.id) {
                    <li>{{ lesson.title }}</li>
                  }
                </ol>
              } @empty {
                <p class="muted">The outline of this course is not available yet.</p>
              }
            </nz-card>
          </div>

          <aside>
            <nz-card class="buy">
              <div class="price">{{ price(current.priceCents, current.currency) }}</div>
              <p class="muted">
                {{ current.lessonCount }} {{ current.lessonCount === 1 ? 'lesson' : 'lessons' }} ·
                access does not expire
              </p>

              @if (owned()) {
                <a
                  nz-button
                  nzType="primary"
                  nzBlock
                  nzSize="large"
                  [routerLink]="['/my-courses', current.id]"
                >
                  Go to course
                </a>
              } @else if (auth.signedIn()) {
                <button
                  nz-button
                  nzType="primary"
                  nzBlock
                  nzSize="large"
                  [nzLoading]="buying()"
                  (click)="buy()"
                >
                  {{ current.priceCents === 0 ? 'Enroll for free' : 'Buy this course' }}
                </button>
              } @else {
                <a
                  nz-button
                  nzType="primary"
                  nzBlock
                  nzSize="large"
                  routerLink="/login"
                  [queryParams]="{ returnUrl: '/courses/' + current.slug }"
                >
                  {{ current.priceCents === 0 ? 'Sign in to enroll' : 'Sign in to buy' }}
                </a>
                <p class="muted note">
                  You need an account to buy a course.
                  <a
                    routerLink="/register"
                    [queryParams]="{ returnUrl: '/courses/' + current.slug }"
                    >Create one</a
                  >.
                </p>
              }
            </nz-card>
          </aside>
        </div>
      }
    </nz-spin>
  `,
  styles: `
    .alert,
    .block {
      margin-bottom: 16px;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 860px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    .summary {
      font-size: 16px;
      color: rgba(0, 0, 0, 0.75);
      margin-bottom: 16px;
    }
    .description {
      white-space: pre-line;
      margin: 0;
    }
    .section {
      font-size: 15px;
      margin: 12px 0 4px;
    }
    .section:first-child {
      margin-top: 0;
    }
    .lessons {
      margin: 0;
      padding-left: 20px;
    }
    .buy {
      position: sticky;
      top: 84px;
    }
    .price {
      font-size: 28px;
      font-weight: 600;
    }
    .note {
      margin: 12px 0 0;
      font-size: 13px;
    }
  `,
})
export class CoursePage {
  private readonly api = inject(StudentApi);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  protected readonly auth = inject(AuthService);

  readonly slug = input.required<string>();
  /** Query parameter Stripe's cancel URL carries. */
  readonly checkout = input<string>();

  protected readonly course = signal<CourseOutline | null>(null);
  protected readonly loading = signal(true);
  protected readonly buying = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly price = formatPrice;

  protected readonly owned = computed(() => {
    const course = this.course();
    return course !== null && this.session.ownedCourseIds().has(course.id);
  });

  constructor() {
    void this.session.refreshCourses();
    effect(() => {
      void this.load(this.slug());
    });
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.course.set(null);
    try {
      const course = await firstValueFrom(this.api.course(slug));
      if (slug === this.slug()) {
        this.course.set(course);
      }
    } catch (error) {
      this.error.set(errorMessage(error, 'The course could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async buy(): Promise<void> {
    const course = this.course();
    if (!course || this.buying()) {
      return;
    }
    this.buying.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.api.checkout(course.id));
      if (result.enrolled) {
        // Free course (or development payments): already ours, no redirect needed.
        await this.session.refreshCourses();
        await this.router.navigate(['/my-courses', course.id], {
          queryParams: { checkout: 'success' },
        });
        return;
      }
      // Stripe Checkout; the button stays busy while the browser leaves.
      window.location.assign(result.url);
    } catch (error) {
      this.buying.set(false);
      if (error instanceof HttpErrorResponse && error.status === 409) {
        await this.session.refreshCourses();
        await this.router.navigate(['/my-courses', course.id]);
        return;
      }
      this.error.set(errorMessage(error, 'The purchase could not be started.'));
    }
  }
}
