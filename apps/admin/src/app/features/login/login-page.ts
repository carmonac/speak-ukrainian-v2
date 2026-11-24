import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, NzCardModule, NzFormModule, NzInputModule, NzButtonModule, NzAlertModule],
  template: `
    <main class="wrap">
      <nz-card class="card" nzTitle="SpeakUkrainian control panel">
        <form nz-form nzLayout="vertical" (ngSubmit)="submit()">
          @if (error(); as message) {
            <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
          }
          @if (notice(); as message) {
            <nz-alert nzType="info" [nzMessage]="message" nzShowIcon class="alert" />
          }
          <nz-form-item>
            <nz-form-label nzFor="email">Email</nz-form-label>
            <nz-form-control>
              <input
                nz-input
                id="email"
                name="email"
                type="email"
                autocomplete="username"
                required
                [(ngModel)]="email"
              />
            </nz-form-control>
          </nz-form-item>
          <nz-form-item>
            <nz-form-label nzFor="password">Password</nz-form-label>
            <nz-form-control>
              <input
                nz-input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                [(ngModel)]="password"
              />
            </nz-form-control>
          </nz-form-item>
          <button
            nz-button
            nzType="primary"
            nzBlock
            [nzLoading]="busy()"
            [disabled]="!email || !password"
          >
            Sign in
          </button>
          <button
            nz-button
            nzType="link"
            nzBlock
            type="button"
            class="forgot"
            [disabled]="busy()"
            (click)="forgot()"
          >
            Forgot your password?
          </button>
        </form>
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
    .forgot {
      margin-top: 8px;
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.email || !this.password || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.auth.signIn(this.email.trim(), this.password);
      await this.router.navigate(['/']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Sends a reset link to the address typed in the form. */
  protected async forgot(): Promise<void> {
    const email = this.email.trim();
    this.error.set(null);
    this.notice.set(null);
    if (!email) {
      this.error.set('Type your email first, then ask for the link.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.requestPasswordReset(email);
      // The same answer whether or not the address has an account.
      this.notice.set(
        'If that address has an account, a link to choose a new password is on its way.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The request could not be sent.');
    } finally {
      this.busy.set(false);
    }
  }
}
