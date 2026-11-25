import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzTableModule, type NzTableQueryParams } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { SiteFile } from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { copyText, formatFileSize } from '../../core/files';
import { errorMessage } from '../../core/http';

/** Every file uploaded for the site's pages: open, inspect, delete. */
@Component({
  selector: 'app-storage-page',
  imports: [
    DatePipe,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzDescriptionsModule,
    NzIconModule,
    NzModalModule,
    NzPopconfirmModule,
    NzTableModule,
    NzTooltipModule,
  ],
  template: `
    <div class="page-header"><h1>Storage</h1></div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }

    <nz-card>
      <p class="muted">
        Files uploaded for the site's pages. Upload new ones from the page editor.
      </p>
      <nz-table
        #table
        nzSize="middle"
        [nzData]="files()"
        [nzFrontPagination]="false"
        [nzLoading]="loading()"
        [nzTotal]="total()"
        [nzPageIndex]="pageIndex()"
        [nzPageSize]="pageSize"
        (nzQueryParams)="onQuery($event)"
        nzNoResult="No files yet. Upload them from the page editor."
      >
        <thead>
          <tr>
            <th>Name</th>
            <th nzAlign="right" nzWidth="160px">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (file of table.data; track file.id) {
            <tr>
              <td class="name">{{ file.name }}</td>
              <td nzAlign="right">
                <a
                  nz-button
                  nzType="text"
                  [href]="file.url"
                  target="_blank"
                  rel="noopener"
                  nz-tooltip
                  nzTooltipTitle="Open in a new tab"
                  [attr.aria-label]="'Open ' + file.name + ' in a new tab'"
                >
                  <nz-icon nzType="export" />
                </a>
                <button
                  nz-button
                  nzType="text"
                  type="button"
                  nz-tooltip
                  nzTooltipTitle="Details"
                  [attr.aria-label]="'Details of ' + file.name"
                  (click)="details.set(file)"
                >
                  <nz-icon nzType="eye" />
                </button>
                <button
                  nz-button
                  nzType="text"
                  nzDanger
                  type="button"
                  nz-popconfirm
                  nzPopconfirmTitle="Delete this file? Pages that link to it will stop showing it."
                  nzPopconfirmPlacement="left"
                  nzOkText="Delete"
                  nzOkDanger
                  [attr.aria-label]="'Delete ' + file.name"
                  (nzOnConfirm)="remove(file)"
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
      [nzVisible]="details() !== null"
      nzTitle="File details"
      [nzFooter]="null"
      nzWidth="640px"
      (nzOnCancel)="details.set(null)"
    >
      <ng-container *nzModalContent>
        @if (details(); as file) {
          <nz-descriptions nzBordered nzSize="small" [nzColumn]="1">
            <nz-descriptions-item nzTitle="Name">{{ file.name }}</nz-descriptions-item>
            <nz-descriptions-item nzTitle="URL">
              <a class="url" [href]="file.url" target="_blank" rel="noopener">{{ file.url }}</a>
              <button
                nz-button
                nzType="text"
                nzSize="small"
                type="button"
                aria-label="Copy URL"
                nz-tooltip
                nzTooltipTitle="Copy URL"
                (click)="copy(file.url)"
              >
                <nz-icon nzType="copy" />
              </button>
            </nz-descriptions-item>
            <nz-descriptions-item nzTitle="Size">{{ size(file.sizeBytes) }}</nz-descriptions-item>
            <nz-descriptions-item nzTitle="Uploaded">{{
              file.uploadedAt | date: 'medium'
            }}</nz-descriptions-item>
          </nz-descriptions>
        }
      </ng-container>
    </nz-modal>
  `,
  styles: `
    .alert {
      margin-bottom: 16px;
    }
    .name,
    .url {
      word-break: break-all;
    }
  `,
})
export class StoragePage {
  private readonly api = inject(AdminApi);
  private readonly message = inject(NzMessageService);

  protected readonly pageSize = 25;
  protected readonly files = signal<SiteFile[]>([]);
  protected readonly total = signal(0);
  protected readonly pageIndex = signal(1);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly details = signal<SiteFile | null>(null);
  protected readonly size = formatFileSize;

  private request = 0;

  protected onQuery(params: NzTableQueryParams): void {
    this.pageIndex.set(params.pageIndex);
    void this.load();
  }

  private async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.files({ limit: this.pageSize, offset: (this.pageIndex() - 1) * this.pageSize }),
      );
      // A slower, older request must not overwrite a newer one.
      if (request !== this.request) {
        return;
      }
      if (page.items.length === 0 && page.total > 0 && this.pageIndex() > 1) {
        // The last file of the last page was deleted: step back to one that has rows.
        this.pageIndex.set(Math.ceil(page.total / this.pageSize));
        void this.load();
        return;
      }
      this.files.set(page.items);
      this.total.set(page.total);
      this.error.set(null);
    } catch (error) {
      if (request === this.request) {
        this.error.set(errorMessage(error, 'The files could not be loaded.'));
      }
    } finally {
      if (request === this.request) {
        this.loading.set(false);
      }
    }
  }

  protected async remove(file: SiteFile): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteFile(file.id));
      this.message.success('File deleted');
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error, 'The file could not be deleted.'));
    }
  }

  protected async copy(url: string): Promise<void> {
    if (await copyText(url)) {
      this.message.success('URL copied');
    } else {
      this.message.error('The URL could not be copied. Select it and copy it by hand.');
    }
  }
}
