import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { StudentApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/http';
import { SessionStore } from '../../core/session.store';

@Component({
  selector: 'app-account-page',
  imports: [
    FormsModule,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
  ],
  template: `
    <div class="page-header"><h1>Account</h1></div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }

    <nz-card class="card">
      <form nz-form nzLayout="vertical" (ngSubmit)="save()">
        <nz-form-item>
          <nz-form-label nzFor="email">Email</nz-form-label>
          <nz-form-control>
            <input nz-input id="email" name="email" [value]="auth.email()" disabled />
          </nz-form-control>
        </nz-form-item>
        <nz-form-item>
          <nz-form-label nzFor="fullName">Full name</nz-form-label>
          <nz-form-control nzExtra="Your teacher sees this name.">
            <input
              nz-input
              id="fullName"
              name="fullName"
              autocomplete="name"
              maxlength="200"
              [(ngModel)]="fullName"
            />
          </nz-form-control>
        </nz-form-item>
        <button nz-button nzType="primary" [nzLoading]="saving()">
          <nz-icon nzType="save" />
          Save
        </button>
      </form>
    </nz-card>
  `,
  styles: `
    .alert {
      margin-bottom: 16px;
    }
    .card {
      max-width: 520px;
    }
  `,
})
export class AccountPage {
  private readonly api = inject(StudentApi);
  private readonly session = inject(SessionStore);
  private readonly message = inject(NzMessageService);
  protected readonly auth = inject(AuthService);

  // A signal, not a plain field: the profile can arrive after the first
  // render (on a page reload), and without zones only a signal tells the
  // template to show it.
  protected readonly fullName = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private loaded = false;

  constructor() {
    // Fills the field once, when the profile arrives; later typing is the student's.
    effect(() => {
      const profile = this.session.profile();
      if (profile && !this.loaded) {
        this.loaded = true;
        this.fullName.set(profile.fullName);
      }
    });
    void this.session.refreshProfile();
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const profile = await firstValueFrom(this.api.updateProfile(this.fullName().trim()));
      this.session.profile.set(profile);
      this.fullName.set(profile.fullName);
      this.message.success('Account saved');
    } catch (error) {
      this.error.set(errorMessage(error, 'Your account could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }
}
