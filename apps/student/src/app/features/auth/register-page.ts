import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzResultModule } from 'ng-zorro-antd/result';
import { safeReturnUrl } from '../../core/auth.guard';
import { AuthService } from '../../core/auth.service';

export const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-register-page',
  imports: [
    FormsModule,
    RouterLink,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzAlertModule,
    NzResultModule,
  ],
  template: `
    <div class="wrap">
      @if (confirmEmail()) {
        <nz-result
          nzStatus="success"
          nzTitle="Check your email"
          [nzSubTitle]="
            'We sent a confirmation link to ' + email + '. Open it to finish creating your account.'
          "
        >
          <div nz-result-extra>
            <a
              nz-button
              nzType="primary"
              routerLink="/login"
              [queryParams]="{ returnUrl: returnUrl() }"
            >
              Go to sign in
            </a>
          </div>
        </nz-result>
      } @else {
        <nz-card class="card" nzTitle="Create your account">
          <form nz-form nzLayout="vertical" (ngSubmit)="submit()">
            @if (error(); as message) {
              <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
            }
            <nz-form-item>
              <nz-form-label nzFor="fullName">Full name</nz-form-label>
              <nz-form-control>
                <input
                  nz-input
                  id="fullName"
                  name="fullName"
                  autocomplete="name"
                  required
                  maxlength="200"
                  [(ngModel)]="fullName"
                />
              </nz-form-control>
            </nz-form-item>
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
            <button nz-button nzType="primary" nzBlock [nzLoading]="busy()" [disabled]="!valid()">
              Create account
            </button>
            <p class="links">
              <a routerLink="/login" [queryParams]="{ returnUrl: returnUrl() }"
                >I already have an account</a
              >
            </p>
          </form>
        </nz-card>
      }
    </div>
  `,
  styleUrl: './auth-card.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected fullName = '';
  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmEmail = signal(false);

  protected valid(): boolean {
    return (
      this.fullName.trim() !== '' &&
      this.email.trim() !== '' &&
      this.password.length >= MIN_PASSWORD_LENGTH
    );
  }

  protected async submit(): Promise<void> {
    if (!this.valid() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const outcome = await this.auth.signUp(
        this.fullName.trim(),
        this.email.trim(),
        this.password,
      );
      if (outcome === 'confirm-email') {
        this.confirmEmail.set(true);
      } else {
        await this.router.navigateByUrl(safeReturnUrl(this.returnUrl(), '/courses'));
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The account could not be created.');
    } finally {
      this.busy.set(false);
    }
  }
}
