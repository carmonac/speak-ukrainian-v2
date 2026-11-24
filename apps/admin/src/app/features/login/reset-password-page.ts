import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService, MIN_PASSWORD_LENGTH } from '../../core/auth.service';

/** Where the link of a password-reset e-mail lands: `/reset-password?token=…`. */
@Component({
  selector: 'app-reset-password-page',
  imports: [
    FormsModule,
    RouterLink,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzAlertModule,
  ],
  template: `
    <main class="wrap">
      <nz-card class="card" nzTitle="Choose a new password">
        @if (done()) {
          <nz-alert
            nzType="success"
            nzMessage="Your password has been changed."
            nzShowIcon
            class="alert"
          />
          <a nz-button nzType="primary" nzBlock routerLink="/login">Sign in</a>
        } @else if (!token()) {
          <nz-alert
            nzType="error"
            nzMessage="This link is not complete. Open it again from the e-mail."
            nzShowIcon
            class="alert"
          />
          <a nz-button nzBlock routerLink="/login">Back to sign in</a>
        } @else {
          <form nz-form nzLayout="vertical" (ngSubmit)="submit()">
            @if (error(); as message) {
              <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
            }
            <nz-form-item>
              <nz-form-label nzFor="next">New password</nz-form-label>
              <nz-form-control [nzExtra]="'At least ' + minLength + ' characters.'">
                <input
                  nz-input
                  id="next"
                  name="next"
                  type="password"
                  autocomplete="new-password"
                  required
                  [(ngModel)]="next"
                />
              </nz-form-control>
            </nz-form-item>
            <nz-form-item>
              <nz-form-label nzFor="repeat">Repeat the new password</nz-form-label>
              <nz-form-control>
                <input
                  nz-input
                  id="repeat"
                  name="repeat"
                  type="password"
                  autocomplete="new-password"
                  required
                  [(ngModel)]="repeat"
                />
              </nz-form-control>
            </nz-form-item>
            <button
              nz-button
              nzType="primary"
              nzBlock
              [nzLoading]="busy()"
              [disabled]="!next || !repeat"
            >
              Change password
            </button>
          </form>
        }
      </nz-card>
    </main>
  `,
  styles: `
    .wrap {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 16px;
    }
    .card {
      width: 100%;
      max-width: 380px;
    }
    .alert {
      margin-bottom: 16px;
    }
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);

  /** From the query string of the e-mailed link. */
  readonly token = input<string>();

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected next = '';
  protected repeat = '';
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    const token = this.token();
    if (!token || !this.next || !this.repeat || this.busy()) {
      return;
    }
    if (this.next.length < MIN_PASSWORD_LENGTH) {
      this.error.set(`The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (this.next !== this.repeat) {
      this.error.set('The two passwords do not match.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.resetPassword(token, this.next);
      // A reset ends every session of the account, this browser's included.
      this.auth.clear();
      this.done.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The password could not be changed.');
    } finally {
      this.busy.set(false);
    }
  }
}
