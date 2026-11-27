import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import {
  couponCodeSchema,
  formatPrice,
  type CheckoutQuote,
  type CourseOutline,
} from '@speakukrainian/shared';
import { StudentApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/http';
import { SessionStore } from '../../core/session.store';

/** A course before buying: description, outline, price and the buy button. */
@Component({
  selector: 'app-course-page',
  imports: [
    FormsModule,
    RouterLink,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzAlertModule,
    NzSpinModule,
  ],
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
                <!-- Sanitized by the API on save, like the summary. -->
                <div class="description rich-text" [innerHTML]="current.description"></div>
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
              @if (quote(); as q) {
                <div class="price">
                  <s class="was">{{ price(q.priceCents, q.currency) }}</s>
                  {{ q.discountedCents === 0 ? 'Free' : price(q.discountedCents, q.currency) }}
                </div>
                <p class="applied">
                  {{ q.percentOff }}% off with <strong>{{ q.couponCode }}</strong> ·
                  <a
                    role="button"
                    tabindex="0"
                    (click)="removeCoupon()"
                    (keydown.enter)="removeCoupon()"
                    >Remove</a
                  >
                </p>
              } @else {
                <div class="price">{{ price(current.priceCents, current.currency) }}</div>
              }
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
                  {{
                    current.priceCents === 0 || quote()?.discountedCents === 0
                      ? 'Enroll for free'
                      : 'Buy this course'
                  }}
                </button>
                @if (current.priceCents > 0 && !quote()) {
                  @if (couponOpen()) {
                    <form class="coupon" (ngSubmit)="applyCoupon()">
                      <input
                        nz-input
                        name="coupon"
                        placeholder="Coupon code"
                        aria-label="Coupon code"
                        autocomplete="off"
                        [(ngModel)]="couponCode"
                      />
                      <button nz-button type="submit" [nzLoading]="applying()">Apply</button>
                    </form>
                    @if (couponError(); as message) {
                      <p class="coupon-error" role="alert">{{ message }}</p>
                    }
                  } @else {
                    <p class="note">
                      <a
                        role="button"
                        tabindex="0"
                        (click)="couponOpen.set(true)"
                        (keydown.enter)="couponOpen.set(true)"
                        >Have a coupon code?</a
                      >
                    </p>
                  }
                }
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
    .description > :first-child {
      margin-top: 0;
    }
    .description > :last-child {
      margin-bottom: 0;
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
    .was {
      margin-right: 6px;
      font-size: 18px;
      font-weight: 400;
      color: rgba(0, 0, 0, 0.45);
    }
    .applied {
      margin: 0 0 8px;
      color: #389e0d;
    }
    .coupon {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .coupon input {
      text-transform: uppercase;
    }
    .coupon-error {
      margin: 6px 0 0;
      font-size: 13px;
      color: #cf1322;
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
  protected readonly couponOpen = signal(false);
  protected couponCode = '';
  protected readonly applying = signal(false);
  protected readonly couponError = signal<string | null>(null);
  /** The price with the coupon the student applied; its code is sent with the purchase. */
  protected readonly quote = signal<CheckoutQuote | null>(null);

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
    this.removeCoupon();
    this.couponOpen.set(false);
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
      const result = await firstValueFrom(this.api.checkout(course.id, this.quote()?.couponCode));
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

  protected async applyCoupon(): Promise<void> {
    const course = this.course();
    const code = this.couponCode.trim();
    if (!course || !code || this.applying()) {
      return;
    }
    // A code no coupon could have: no need to ask, and no validation jargon.
    if (!couponCodeSchema.safeParse(code).success) {
      this.couponError.set('That coupon code does not exist.');
      return;
    }
    this.applying.set(true);
    this.couponError.set(null);
    try {
      this.quote.set(await firstValueFrom(this.api.checkoutQuote(course.id, code)));
    } catch (error) {
      this.couponError.set(errorMessage(error, 'The coupon could not be checked.'));
    } finally {
      this.applying.set(false);
    }
  }

  protected removeCoupon(): void {
    this.quote.set(null);
    this.couponCode = '';
    this.couponError.set(null);
  }
}
