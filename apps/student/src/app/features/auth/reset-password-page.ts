import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../core/auth.service';
import { MIN_PASSWORD_LENGTH } from './register-page';

/**
 * Where the link in the reset email lands: `/reset-password?token=…`. The
 * token is single-use and short-lived; the API says so if it is no longer
 * good.
 */
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
    <div class="wrap">
      <nz-card class="card" nzTitle="Choose a new password">
        @if (!token()) {
          <nz-alert
            nzType="warning"
            nzShowIcon
            nzMessage="This reset link is not complete. Open it again from the email, or request a new one."
          />
          <p class="links"><a routerLink="/forgot-password">Request a new link</a></p>
        } @else {
          <form nz-form nzLayout="vertical" (ngSubmit)="submit()">
            @if (error(); as message) {
              <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
            }
            <nz-form-item>
              <nz-form-label nzFor="password">New password</nz-form-label>
              <nz-form-control [nzExtra]="'At least ' + minLength + ' characters.'">
                <input
                  nz-input
                  id="password"
                  name="password"
                  type="password"
                  autocomplete="new-password"
                  required
                  [minlength]="minLength"
                  [(ngModel)]="password"
                />
              </nz-form-control>
            </nz-form-item>
            <button
              nz-button
              nzType="primary"
              nzBlock
              [nzLoading]="busy()"
              [disabled]="password.length < minLength"
            >
              Save password
            </button>
            <p class="links"><a routerLink="/forgot-password">Request a new link</a></p>
          </form>
        }
      </nz-card>
    </div>
  `,
  styleUrl: './auth-card.scss',
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  /** From the query string of the e-mailed link. */
  readonly token = input<string>();

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    const token = this.token();
    if (!token || this.password.length < MIN_PASSWORD_LENGTH || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.resetPassword(token, this.password);
      // A reset ends every session of the account, so the student signs in
      // again, with the new password.
      this.message.success('Password changed. Sign in with your new password.');
      await this.router.navigate(['/login']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The password could not be changed.');
    } finally {
      this.busy.set(false);
    }
  }
}
