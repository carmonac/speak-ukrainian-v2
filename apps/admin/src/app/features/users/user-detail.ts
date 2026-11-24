import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import type { UserDetail } from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { errorMessage } from '../../core/http';

@Component({
  selector: 'app-user-detail',
  imports: [
    DatePipe,
    FormsModule,
    TextFieldModule,
    RouterLink,
    NzCardModule,
    NzDescriptionsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
    NzSpinModule,
    NzModalModule,
    NzProgressModule,
    NzBadgeModule,
  ],
  template: `
    <div class="page-header">
      <h1>{{ user()?.fullName || user()?.email || 'User' }}</h1>
      <div class="page-actions">
        <a nz-button routerLink="/users">
          <nz-icon nzType="arrow-left" />
          All users
        </a>
        @if (user(); as current) {
          <a nz-button [routerLink]="['/users', current.id, 'conversation']">
            <nz-icon nzType="message" />
            Open conversation
            @if (current.unreadMessages > 0) {
              <nz-badge class="badge" [nzCount]="current.unreadMessages" nzSize="small" />
            }
          </a>
          <button nz-button (click)="openEmail()">
            <nz-icon nzType="mail" />
            Send email
          </button>
        }
      </div>
    </div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="block" />
    }

    <nz-spin [nzSpinning]="loading()">
      @if (user(); as current) {
        <nz-card nzTitle="Account" class="block">
          <nz-descriptions [nzColumn]="{ xs: 1, md: 3 }" nzSize="small">
            <nz-descriptions-item nzTitle="Email">{{ current.email }}</nz-descriptions-item>
            <nz-descriptions-item nzTitle="Registered">{{
              current.createdAt | date: 'medium'
            }}</nz-descriptions-item>
            <nz-descriptions-item nzTitle="Last sign-in">
              {{ current.lastSignInAt ? (current.lastSignInAt | date: 'medium') : 'Never' }}
            </nz-descriptions-item>
          </nz-descriptions>
        </nz-card>

        <nz-card nzTitle="Profile" class="block">
          <form nz-form nzLayout="vertical" (ngSubmit)="save()">
            <nz-form-item>
              <nz-form-label nzFor="fullName">Full name</nz-form-label>
              <nz-form-control>
                <input
                  nz-input
                  id="fullName"
                  name="fullName"
                  [(ngModel)]="form.fullName"
                  maxlength="200"
                />
              </nz-form-control>
            </nz-form-item>
            <nz-form-item>
              <nz-form-label nzFor="locale">Language</nz-form-label>
              <nz-form-control nzExtra="Language code the student prefers, e.g. en or es.">
                <input
                  nz-input
                  id="locale"
                  name="locale"
                  class="short"
                  [(ngModel)]="form.locale"
                  maxlength="10"
                />
              </nz-form-control>
            </nz-form-item>
            <nz-form-item>
              <nz-form-label nzFor="notes">Private notes</nz-form-label>
              <nz-form-control nzExtra="Only you can see these.">
                <textarea
                  nz-input
                  id="notes"
                  name="notes"
                  cdkTextareaAutosize
                  [cdkAutosizeMinRows]="3"
                  [cdkAutosizeMaxRows]="12"
                  [(ngModel)]="form.notes"
                ></textarea>
              </nz-form-control>
            </nz-form-item>
            <button nz-button nzType="primary" [nzLoading]="saving()">
              <nz-icon nzType="save" />
              Save
            </button>
          </form>
        </nz-card>

        <nz-card nzTitle="Courses" class="block">
          @for (course of current.courses; track course.id) {
            <div class="course">
              <a [routerLink]="['/courses', course.id]">{{ course.title }}</a>
              <span class="muted">since {{ course.enrolledAt | date: 'mediumDate' }}</span>
              <nz-progress class="progress" [nzPercent]="course.progressPercent" nzSize="small" />
            </div>
          } @empty {
            <p class="muted">This student has not bought any course yet.</p>
          }
        </nz-card>
      }
    </nz-spin>

    <nz-modal
      [nzVisible]="emailOpen()"
      nzTitle="Send email"
      nzOkText="Send"
      [nzOkLoading]="sending()"
      [nzOkDisabled]="!email.subject.trim() || !email.body.trim()"
      (nzOnOk)="sendEmail()"
      (nzOnCancel)="emailOpen.set(false)"
    >
      <ng-container *nzModalContent>
        <p class="muted">To: {{ user()?.email }}</p>
        <form nz-form nzLayout="vertical">
          <nz-form-item>
            <nz-form-label nzFor="subject" nzRequired>Subject</nz-form-label>
            <nz-form-control>
              <input
                nz-input
                id="subject"
                name="subject"
                [(ngModel)]="email.subject"
                maxlength="200"
              />
            </nz-form-control>
          </nz-form-item>
          <nz-form-item>
            <nz-form-label nzFor="body" nzRequired>Message</nz-form-label>
            <nz-form-control>
              <textarea nz-input id="body" name="body" rows="8" [(ngModel)]="email.body"></textarea>
            </nz-form-control>
          </nz-form-item>
        </form>
      </ng-container>
    </nz-modal>
  `,
  styles: `
    .block {
      margin-bottom: 16px;
    }
    .short {
      max-width: 160px;
    }
    .badge {
      margin-left: 8px;
    }
    .course {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(120px, 1fr);
      gap: 16px;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .course:last-child {
      border-bottom: 0;
    }
  `,
})
export class UserDetailPage {
  private readonly api = inject(AdminApi);
  private readonly message = inject(NzMessageService);

  readonly id = input.required<string>();

  protected readonly user = signal<UserDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected form = { fullName: '', locale: 'en', notes: '' };

  protected readonly emailOpen = signal(false);
  protected readonly sending = signal(false);
  protected email = { subject: '', body: '' };

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.apply(await firstValueFrom(this.api.user(id)));
    } catch (error) {
      this.error.set(errorMessage(error, 'The user could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  private apply(user: UserDetail): void {
    this.form = { fullName: user.fullName, locale: user.locale, notes: user.notes };
    this.user.set(user);
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.apply(
        await firstValueFrom(
          this.api.updateUser(this.id(), {
            fullName: this.form.fullName.trim(),
            locale: this.form.locale.trim() || 'en',
            notes: this.form.notes,
          }),
        ),
      );
      this.message.success('User saved');
    } catch (error) {
      this.error.set(errorMessage(error, 'The user could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected openEmail(): void {
    this.email = { subject: '', body: '' };
    this.emailOpen.set(true);
  }

  protected async sendEmail(): Promise<void> {
    this.sending.set(true);
    try {
      await firstValueFrom(
        this.api.sendEmail(this.id(), {
          subject: this.email.subject.trim(),
          body: this.email.body.trim(),
        }),
      );
      this.message.success('Email sent');
      this.emailOpen.set(false);
    } catch (error) {
      this.message.error(errorMessage(error, 'The email could not be sent.'));
    } finally {
      this.sending.set(false);
    }
  }
}
