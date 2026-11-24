import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { safeReturnUrl } from '../../core/auth.guard';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
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
      <nz-card class="card" nzTitle="Sign in">
        <form nz-form nzLayout="vertical" (ngSubmit)="submit()">
          @if (error(); as message) {
            <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
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
          <p class="links">
            <a routerLink="/forgot-password">Forgot your password?</a>
            <a routerLink="/register" [queryParams]="{ returnUrl: returnUrl() }"
              >Create an account</a
            >
          </p>
        </form>
      </nz-card>
    </div>
  `,
  styleUrl: './auth-card.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query parameter: where to go once signed in. */
  readonly returnUrl = input<string>();

  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.email || !this.password || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.signIn(this.email.trim(), this.password);
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
