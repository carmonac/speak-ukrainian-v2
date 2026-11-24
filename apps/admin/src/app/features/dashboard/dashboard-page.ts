import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTableModule } from 'ng-zorro-antd/table';
import { formatPrice, type DashboardStats } from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { errorMessage } from '../../core/http';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    RouterLink,
    NzGridModule,
    NzCardModule,
    NzStatisticModule,
    NzTableModule,
    NzSpinModule,
    NzAlertModule,
  ],
  template: `
    <div class="page-header"><h1>Dashboard</h1></div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon />
    }

    <nz-spin [nzSpinning]="stats() === null && error() === null">
      <div nz-row [nzGutter]="[16, 16]">
        <div nz-col [nzXs]="12" [nzLg]="6">
          <nz-card><nz-statistic nzTitle="Pages" [nzValue]="stats()?.pages ?? 0" /></nz-card>
        </div>
        <div nz-col [nzXs]="12" [nzLg]="6">
          <nz-card>
            <nz-statistic nzTitle="Visitors (last 30 days)" [nzValue]="stats()?.visitors ?? 0" />
          </nz-card>
        </div>
        <div nz-col [nzXs]="12" [nzLg]="6">
          <nz-card><nz-statistic nzTitle="Students" [nzValue]="stats()?.students ?? 0" /></nz-card>
        </div>
        <div nz-col [nzXs]="12" [nzLg]="6">
          <nz-card><nz-statistic nzTitle="Courses" [nzValue]="stats()?.courses ?? 0" /></nz-card>
        </div>
      </div>

      <nz-card nzTitle="Sales" class="sales">
        <nz-table
          #table
          [nzData]="stats()?.sales ?? []"
          [nzPageSize]="10"
          [nzShowPagination]="(stats()?.sales?.length ?? 0) > 10"
          nzSize="middle"
          nzNoResult="No sales yet"
        >
          <thead>
            <tr>
              <th>Date</th>
              <th>Student</th>
              <th>Course</th>
              <th nzAlign="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            @for (sale of table.data; track sale.id) {
              <tr>
                <td>{{ sale.paidAt | date: 'medium' }}</td>
                <td>
                  <a [routerLink]="['/users', sale.studentId]">{{
                    sale.studentName || sale.studentEmail
                  }}</a>
                </td>
                <td>
                  <a [routerLink]="['/courses', sale.courseId]">{{ sale.courseTitle }}</a>
                </td>
                <td nzAlign="right">{{ price(sale.amountCents, sale.currency) }}</td>
              </tr>
            }
          </tbody>
        </nz-table>
      </nz-card>
    </nz-spin>
  `,
  styles: `
    .sales {
      margin-top: 16px;
    }
  `,
})
export class DashboardPage {
  private readonly api = inject(AdminApi);

  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly price = formatPrice;

  constructor() {
    firstValueFrom(this.api.dashboard()).then(
      (stats) => this.stats.set(stats),
      (error: unknown) => this.error.set(errorMessage(error)),
    );
  }
}
