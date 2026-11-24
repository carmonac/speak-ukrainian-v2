import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { AuthService } from '../../core/auth.service';
import { MIN_PASSWORD_LENGTH } from './register-page';

/**
 * Where the link in the reset email lands. Supabase signs the student in from
 * the link itself, so by the time this renders there is a session to change
 * the password of — or the link was invalid or has expired.
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
    NzSpinModule,
  ],
  template: `
    <div class="wrap">
      <nz-card class="card" nzTitle="Choose a new password">
        <nz-spin [nzSpinning]="checking()">
          @if (!checking() && !auth.signedIn()) {
            <nz-alert
              nzType="warning"
              nzShowIcon
              nzMessage="This reset link is not valid any more. Request a new one."
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
            </form>
          }
        </nz-spin>
      </nz-card>
    </div>
  `,
  styleUrl: './auth-card.scss',
})
export class ResetPasswordPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected password = '';
  protected readonly checking = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // The session from the email link is exchanged asynchronously; give it a
    // moment before concluding that the link was bad.
    void this.auth.ready().then((signedIn) => {
      if (signedIn) {
        this.checking.set(false);
      } else {
        setTimeout(() => this.checking.set(false), 1500);
      }
    });
  }

  protected async submit(): Promise<void> {
    if (this.password.length < MIN_PASSWORD_LENGTH || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.updatePassword(this.password);
      this.message.success('Password changed');
      await this.router.navigate(['/my-courses']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The password could not be changed.');
    } finally {
      this.busy.set(false);
    }
  }
}
