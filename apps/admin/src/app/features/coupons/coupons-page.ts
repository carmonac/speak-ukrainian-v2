import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { couponInputSchema, type Coupon } from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { errorMessage } from '../../core/http';

interface CouponForm {
  code: string;
  percentOff: number | null;
  /** `YYYY-MM-DD`, as a date input gives it. */
  startsOn: string;
  endsOn: string;
}

const EMPTY_FORM: CouponForm = { code: '', percentOff: 10, startsOn: '', endsOn: '' };

/** Discount coupons: codes students type while buying a course. */
@Component({
  selector: 'app-coupons-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzPopconfirmModule,
    NzTableModule,
    NzTagModule,
    NzTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1>Coupons</h1>
      <button nz-button nzType="primary" type="button" (click)="openNew()">
        <nz-icon nzType="plus" />
        Add coupon
      </button>
    </div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }

    <nz-card>
      <p class="muted">
        A student types the code while buying a course and pays less. A coupon works from the first
        day to the last one, both included (UTC).
      </p>
      <nz-table
        #table
        nzSize="middle"
        [nzData]="coupons()"
        [nzLoading]="loading()"
        [nzPageSize]="50"
        [nzHideOnSinglePage]="true"
        nzNoResult="No coupons yet."
      >
        <thead>
          <tr>
            <th>Code</th>
            <th>Discount</th>
            <th>Valid</th>
            <th>Status</th>
            <th nzAlign="right">Used</th>
            <th nzAlign="right" nzWidth="120px">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (coupon of table.data; track coupon.id) {
            <tr>
              <td class="code">{{ coupon.code }}</td>
              <td>{{ coupon.percentOff }}%</td>
              <td>{{ coupon.startsOn }} → {{ coupon.endsOn }}</td>
              <td>
                @if (coupon.active) {
                  <nz-tag nzColor="green">Active</nz-tag>
                } @else if (coupon.startsOn > today) {
                  <nz-tag nzColor="blue">Scheduled</nz-tag>
                } @else {
                  <nz-tag>Expired</nz-tag>
                }
              </td>
              <td nzAlign="right">{{ coupon.timesUsed }}</td>
              <td nzAlign="right">
                <button
                  nz-button
                  nzType="text"
                  type="button"
                  nz-tooltip
                  nzTooltipTitle="Edit"
                  [attr.aria-label]="'Edit ' + coupon.code"
                  (click)="openEdit(coupon)"
                >
                  <nz-icon nzType="edit" />
                </button>
                <button
                  nz-button
                  nzType="text"
                  nzDanger
                  type="button"
                  nz-popconfirm
                  nzPopconfirmTitle="Delete this coupon? Past purchases keep the discount they got."
                  nzPopconfirmPlacement="left"
                  nzOkText="Delete"
                  nzOkDanger
                  [attr.aria-label]="'Delete ' + coupon.code"
                  (nzOnConfirm)="remove(coupon)"
                >
                  <nz-icon nzType="delete" />
                </button>
              </td>
            </tr>
          }
        </tbody>
      </nz-table>
    </nz-card>

    <nz-modal
      [nzVisible]="editing() !== null"
      [nzTitle]="editing() === 'new' ? 'Add coupon' : 'Edit coupon'"
      nzOkText="Save"
      [nzOkLoading]="saving()"
      (nzOnOk)="save()"
      (nzOnCancel)="editing.set(null)"
    >
      <ng-container *nzModalContent>
        <form nz-form nzLayout="vertical" (ngSubmit)="save()">
          <nz-form-item>
            <nz-form-label nzFor="code" nzRequired>Code</nz-form-label>
            <nz-form-control nzExtra="Letters, digits, - and _. Students can type it in any case.">
              <input
                nz-input
                id="code"
                name="code"
                autocomplete="off"
                class="code-input"
                [(ngModel)]="form().code"
              />
            </nz-form-control>
          </nz-form-item>
          <nz-form-item>
            <nz-form-label nzFor="percentOff" nzRequired>Discount (%)</nz-form-label>
            <nz-form-control nzExtra="100% makes the course free with this code.">
              <nz-input-number
                nzId="percentOff"
                name="percentOff"
                [nzMin]="1"
                [nzMax]="100"
                [nzStep]="5"
                [nzPrecision]="0"
                [(ngModel)]="form().percentOff"
              />
            </nz-form-control>
          </nz-form-item>
          <div class="dates">
            <nz-form-item>
              <nz-form-label nzFor="startsOn" nzRequired>First day</nz-form-label>
              <nz-form-control>
                <input
                  nz-input
                  type="date"
                  id="startsOn"
                  name="startsOn"
                  [(ngModel)]="form().startsOn"
                />
              </nz-form-control>
            </nz-form-item>
            <nz-form-item>
              <nz-form-label nzFor="endsOn" nzRequired>Last day</nz-form-label>
              <nz-form-control>
                <input
                  nz-input
                  type="date"
                  id="endsOn"
                  name="endsOn"
                  [min]="form().startsOn"
                  [(ngModel)]="form().endsOn"
                />
              </nz-form-control>
            </nz-form-item>
          </div>
          @if (formError(); as message) {
            <nz-alert nzType="error" [nzMessage]="message" nzShowIcon />
          }
          <!-- Enter in a field submits the form. -->
          <button type="submit" hidden></button>
        </form>
      </ng-container>
    </nz-modal>
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .alert {
      margin-bottom: 16px;
    }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 600;
    }
    .dates {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .code-input {
      text-transform: uppercase;
    }
  `,
})
export class CouponsPage {
  private readonly api = inject(AdminApi);
  private readonly message = inject(NzMessageService);

  protected readonly coupons = signal<Coupon[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** `'new'`, the coupon being edited, or `null` when the dialog is closed. */
  protected readonly editing = signal<'new' | Coupon | null>(null);
  protected readonly form = signal<CouponForm>({ ...EMPTY_FORM });
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  /** For telling scheduled coupons from expired ones; the same UTC day the API uses. */
  protected readonly today = new Date().toISOString().slice(0, 10);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.coupons.set(await firstValueFrom(this.api.coupons()));
      this.error.set(null);
    } catch (error) {
      this.error.set(errorMessage(error, 'The coupons could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected openNew(): void {
    this.form.set({ ...EMPTY_FORM });
    this.formError.set(null);
    this.editing.set('new');
  }

  protected openEdit(coupon: Coupon): void {
    this.form.set({
      code: coupon.code,
      percentOff: coupon.percentOff,
      startsOn: coupon.startsOn,
      endsOn: coupon.endsOn,
    });
    this.formError.set(null);
    this.editing.set(coupon);
  }

  protected async save(): Promise<void> {
    const editing = this.editing();
    if (!editing || this.saving()) {
      return;
    }
    const { code, percentOff, startsOn, endsOn } = this.form();
    if (!startsOn || !endsOn) {
      this.formError.set('Choose the first and the last day.');
      return;
    }
    const parsed = couponInputSchema.safeParse({ code, percentOff, startsOn, endsOn });
    if (!parsed.success) {
      this.formError.set(parsed.error.issues[0]?.message ?? 'Check the coupon.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      await firstValueFrom(
        editing === 'new'
          ? this.api.createCoupon(parsed.data)
          : this.api.updateCoupon(editing.id, parsed.data),
      );
      this.message.success(editing === 'new' ? 'Coupon created' : 'Coupon saved');
      this.editing.set(null);
      await this.load();
    } catch (error) {
      this.formError.set(errorMessage(error, 'The coupon could not be saved.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(coupon: Coupon): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteCoupon(coupon.id));
      this.message.success('Coupon deleted');
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error, 'The coupon could not be deleted.'));
    }
  }
}
