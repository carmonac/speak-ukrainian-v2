import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-forgot-password-page',
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
      <nz-card class="card" nzTitle="Reset your password">
        @if (sent()) {
          <nz-alert
            nzType="success"
            nzShowIcon
            nzMessage="If an account exists for that address, we have sent it a link to choose a new password."
          />
          <p class="links"><a routerLink="/login">Back to sign in</a></p>
        } @else {
          <form nz-form nzLayout="vertical" (ngSubmit)="submit()">
            @if (error(); as message) {
              <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
            }
            <nz-form-item>
              <nz-form-label nzFor="email">Email</nz-form-label>
              <nz-form-control nzExtra="We will email you a link to choose a new password.">
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
            <button
              nz-button
              nzType="primary"
              nzBlock
              [nzLoading]="busy()"
              [disabled]="!email.trim()"
            >
              Send reset link
            </button>
            <p class="links"><a routerLink="/login">Back to sign in</a></p>
          </form>
        }
      </nz-card>
    </div>
  `,
  styleUrl: './auth-card.scss',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected email = '';
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.email.trim() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.requestPasswordReset(this.email.trim());
      this.sent.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The reset email could not be sent.');
    } finally {
      this.busy.set(false);
    }
  }
}
