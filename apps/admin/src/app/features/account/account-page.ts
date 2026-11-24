import { Component, inject, signal } from '@angular/core';
import { FormsModule, type NgForm } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService, MIN_PASSWORD_LENGTH } from '../../core/auth.service';

/** The administrator's own account: who is signed in, and changing the password. */
@Component({
  selector: 'app-account-page',
  imports: [FormsModule, NzCardModule, NzFormModule, NzInputModule, NzButtonModule, NzAlertModule],
  template: `
    <div class="page-header">
      <h1>Account</h1>
    </div>

    <nz-card nzTitle="Change password" class="card">
      <p class="muted">
        Signed in as <strong>{{ email() }}</strong>. Changing the password signs this account out
        everywhere else.
      </p>

      <form nz-form nzLayout="vertical" #form="ngForm" (ngSubmit)="submit(form)">
        @if (error(); as message) {
          <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
        }
        @if (done()) {
          <nz-alert
            nzType="success"
            nzMessage="Your password has been changed."
            nzShowIcon
            class="alert"
          />
        }

        <nz-form-item>
          <nz-form-label nzFor="current">Current password</nz-form-label>
          <nz-form-control>
            <input
              nz-input
              id="current"
              name="current"
              type="password"
              autocomplete="current-password"
              required
              [(ngModel)]="current"
            />
          </nz-form-control>
        </nz-form-item>
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
          [nzLoading]="busy()"
          [disabled]="!current || !next || !repeat"
        >
          Change password
        </button>
      </form>
    </nz-card>
  `,
  styles: `
    .card {
      max-width: 520px;
    }
    .alert {
      margin-bottom: 16px;
    }
  `,
})
export class AccountPage {
  private readonly auth = inject(AuthService);

  protected readonly email = this.auth.email;
  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected current = '';
  protected next = '';
  protected repeat = '';
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(form: NgForm): Promise<void> {
    if (!this.current || !this.next || !this.repeat || this.busy()) {
      return;
    }
    this.done.set(false);
    const problem = this.problem();
    this.error.set(problem);
    if (problem) {
      return;
    }

    this.busy.set(true);
    try {
      await this.auth.changePassword(this.current, this.next);
      // Also clears the fields' touched state, so the emptied form does not
      // show as invalid.
      form.resetForm();
      this.done.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The password could not be changed.');
    } finally {
      this.busy.set(false);
    }
  }

  private problem(): string | null {
    if (this.next.length < MIN_PASSWORD_LENGTH) {
      return `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (this.next !== this.repeat) {
      return 'The two new passwords do not match.';
    }
    if (this.next === this.current) {
      return 'The new password must be different from the current one.';
    }
    return null;
  }
}
