import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTableModule, type NzTableQueryParams } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import type { ConversationSummary, UserSummary } from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { errorMessage } from '../../core/http';

@Component({
  selector: 'app-users-page',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    NzCardModule,
    NzTableModule,
    NzInputModule,
    NzTabsModule,
    NzBadgeModule,
    NzAlertModule,
  ],
  template: `
    <div class="page-header"><h1>Users</h1></div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }

    <nz-card>
      <nz-tabs>
        <nz-tab nzTitle="All users">
          <input
            nz-input
            class="search"
            type="search"
            placeholder="Search by name or email"
            aria-label="Search users"
            [ngModel]="search()"
            (ngModelChange)="onSearch($event)"
          />
          <nz-table
            #table
            nzSize="middle"
            [nzData]="users()"
            [nzFrontPagination]="false"
            [nzLoading]="loading()"
            [nzTotal]="total()"
            [nzPageIndex]="pageIndex()"
            [nzPageSize]="pageSize"
            (nzQueryParams)="onQuery($event)"
            nzNoResult="No users yet. Students register from the classroom."
          >
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Registered</th>
                <th nzAlign="right">Courses</th>
                <th nzAlign="right">New messages</th>
              </tr>
            </thead>
            <tbody>
              @for (user of table.data; track user.id) {
                <tr class="clickable" (click)="open(user.id)">
                  <td>
                    <a [routerLink]="['/users', user.id]" (click)="$event.stopPropagation()">
                      {{ user.fullName || '—' }}
                    </a>
                  </td>
                  <td>{{ user.email }}</td>
                  <td>{{ user.createdAt | date: 'mediumDate' }}</td>
                  <td nzAlign="right">{{ user.courseCount }}</td>
                  <td nzAlign="right">
                    @if (user.unreadMessages > 0) {
                      <nz-badge [nzCount]="user.unreadMessages" />
                    } @else {
                      <span class="muted">0</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </nz-table>
        </nz-tab>

        <nz-tab nzTitle="Conversations" (nzSelect)="loadConversations()">
          <nz-table
            #chats
            nzSize="middle"
            [nzData]="conversations()"
            [nzShowPagination]="conversations().length > 10"
            nzNoResult="No conversations yet"
          >
            <thead>
              <tr>
                <th>Student</th>
                <th>Last message</th>
                <th>When</th>
                <th nzAlign="right">Unread</th>
              </tr>
            </thead>
            <tbody>
              @for (chat of chats.data; track chat.studentId) {
                <tr class="clickable" (click)="openChat(chat.studentId)">
                  <td>
                    <a
                      [routerLink]="['/users', chat.studentId, 'conversation']"
                      (click)="$event.stopPropagation()"
                    >
                      {{ chat.fullName || chat.email }}
                    </a>
                  </td>
                  <td>
                    <span class="muted">{{ chat.lastSender === 'admin' ? 'You: ' : '' }}</span>{{
                      chat.lastMessage
                    }}
                  </td>
                  <td>{{ chat.lastMessageAt | date: 'short' }}</td>
                  <td nzAlign="right">
                    @if (chat.unread > 0) {
                      <nz-badge [nzCount]="chat.unread" />
                    }
                  </td>
                </tr>
              }
            </tbody>
          </nz-table>
        </nz-tab>
      </nz-tabs>
    </nz-card>
  `,
  styles: `
    .alert {
      margin-bottom: 16px;
    }
    .search {
      max-width: 360px;
      margin-bottom: 16px;
    }
    .clickable {
      cursor: pointer;
    }
  `,
})
export class UsersPage {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);

  protected readonly pageSize = 25;
  protected readonly users = signal<UserSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly pageIndex = signal(1);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly conversations = signal<ConversationSummary[]>([]);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private request = 0;

  protected onQuery(params: NzTableQueryParams): void {
    this.pageIndex.set(params.pageIndex);
    void this.load();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.pageIndex.set(1);
      void this.load();
    }, 300);
  }

  private async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    try {
      const page = await firstValueFrom(
        this.api.users({
          limit: this.pageSize,
          offset: (this.pageIndex() - 1) * this.pageSize,
          search: this.search().trim() || undefined,
        }),
      );
      // A slower, older request must not overwrite a newer one.
      if (request === this.request) {
        this.users.set(page.items);
        this.total.set(page.total);
        this.error.set(null);
      }
    } catch (error) {
      if (request === this.request) {
        this.error.set(errorMessage(error, 'The users could not be loaded.'));
      }
    } finally {
      if (request === this.request) {
        this.loading.set(false);
      }
    }
  }

  protected async loadConversations(): Promise<void> {
    try {
      this.conversations.set(await firstValueFrom(this.api.conversations()));
    } catch (error) {
      this.error.set(errorMessage(error, 'The conversations could not be loaded.'));
    }
  }

  protected open(id: string): void {
    void this.router.navigate(['/users', id]);
  }

  protected openChat(id: string): void {
    void this.router.navigate(['/users', id, 'conversation']);
  }
}
