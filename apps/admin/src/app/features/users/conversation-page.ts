import { DatePipe } from '@angular/common';
import {
  Component,
  type ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { MESSAGES_TABLE, type Message, type UserDetail } from '@speakukrainian/shared';
import { AdminApi } from '../../core/api';
import { errorMessage } from '../../core/http';
import { NavStore } from '../../core/nav.store';
import { Supabase } from '../../core/supabase';

/** The chat between the administrator and one student, updated live. */
@Component({
  selector: 'app-conversation-page',
  imports: [
    DatePipe,
    FormsModule,
    TextFieldModule,
    RouterLink,
    NzCardModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
    NzSpinModule,
  ],
  template: `
    <div class="page-header">
      <h1>Conversation with {{ user()?.fullName || user()?.email || '…' }}</h1>
      <div class="page-actions">
        <a nz-button [routerLink]="['/users', id()]">
          <nz-icon nzType="arrow-left" />
          User details
        </a>
      </div>
    </div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }

    <nz-card>
      <nz-spin [nzSpinning]="loading()">
        <div #scroller class="thread" role="log" aria-live="polite">
          @for (message of messages(); track message.id) {
            <div class="bubble" [class.mine]="message.sender === 'admin'">
              @if (message.lessonTitle) {
                <div class="context">
                  Asked from: {{ message.courseTitle }} › {{ message.lessonTitle }}
                </div>
              }
              <div class="body">{{ message.body }}</div>
              <div class="meta">
                {{ message.createdAt | date: 'short' }}
                @if (message.sender === 'admin') {
                  · {{ message.readAt ? 'Read' : 'Not read yet' }}
                }
              </div>
            </div>
          } @empty {
            <p class="muted empty">No messages yet. Write the first one below.</p>
          }
        </div>
      </nz-spin>

      <form class="composer" (ngSubmit)="send()">
        <textarea
          nz-input
          name="draft"
          [(ngModel)]="draft"
          cdkTextareaAutosize
          [cdkAutosizeMinRows]="2"
          [cdkAutosizeMaxRows]="8"
          placeholder="Write a message…"
          aria-label="Message"
          (keydown.control.enter)="send()"
          (keydown.meta.enter)="send()"
        ></textarea>
        <button nz-button nzType="primary" [nzLoading]="sending()" [disabled]="!draft.trim()">
          <nz-icon nzType="send" />
          Send
        </button>
      </form>
      <p class="muted hint">
        If the student has not read or answered within 24 hours, they get an email saying they have
        new messages.
      </p>
    </nz-card>
  `,
  styles: `
    .alert {
      margin-bottom: 16px;
    }
    .thread {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 56vh;
      overflow-y: auto;
      padding: 8px 4px 16px;
    }
    .bubble {
      align-self: flex-start;
      max-width: min(640px, 80%);
      padding: 8px 12px;
      border-radius: 12px;
      background: #f0f0f0;
    }
    .bubble.mine {
      align-self: flex-end;
      background: #e6f4ff;
    }
    .body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .context {
      font-size: 12px;
      font-weight: 600;
      color: #0958d9;
      margin-bottom: 4px;
    }
    .meta {
      margin-top: 4px;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.45);
    }
    .empty {
      margin: auto;
    }
    .composer {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      border-top: 1px solid #f0f0f0;
      padding-top: 16px;
    }
    .hint {
      margin: 8px 0 0;
      font-size: 12px;
    }
  `,
})
export class ConversationPage {
  private readonly api = inject(AdminApi);
  private readonly nav = inject(NavStore);
  private readonly supabase = inject(Supabase).client;

  readonly id = input.required<string>();

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly user = signal<UserDetail | null>(null);
  protected readonly messages = signal<Message[]>([]);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected draft = '';

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.loading.set(true);
      this.messages.set([]);
      this.user.set(null);

      firstValueFrom(this.api.user(id)).then(
        (user) => this.user.set(user),
        () => undefined,
      );
      void this.refresh(id);

      // Realtime only says "something changed"; the thread is re-read through
      // the API, which stays the single source of truth for its shape.
      const channel = this.supabase
        .channel(`admin-thread-${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: MESSAGES_TABLE, filter: `student_id=eq.${id}` },
          () => void this.refresh(id),
        )
        .subscribe();

      onCleanup(() => void this.supabase.removeChannel(channel));
    });
  }

  private async refresh(id: string): Promise<void> {
    try {
      const messages = await firstValueFrom(this.api.messages(id));
      if (id !== this.id()) {
        return;
      }
      const grew = messages.length !== this.messages().length;
      this.messages.set(messages);
      this.error.set(null);
      if (messages.some((m) => m.sender === 'student' && m.readAt === null)) {
        await firstValueFrom(this.api.markRead(id));
        void this.nav.refreshUnread();
      }
      if (grew) {
        this.scrollToEnd();
      }
    } catch (error) {
      this.error.set(errorMessage(error, 'The conversation could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async send(): Promise<void> {
    const body = this.draft.trim();
    if (!body || this.sending()) {
      return;
    }
    this.sending.set(true);
    try {
      const message = await firstValueFrom(this.api.sendMessage(this.id(), body));
      this.draft = '';
      if (!this.messages().some((m) => m.id === message.id)) {
        this.messages.update((list) => [...list, message]);
      }
      this.scrollToEnd();
    } catch (error) {
      this.error.set(errorMessage(error, 'The message could not be sent.'));
    } finally {
      this.sending.set(false);
    }
  }

  private scrollToEnd(): void {
    // After the new bubble has been rendered.
    setTimeout(() => {
      const element = this.scroller().nativeElement;
      element.scrollTop = element.scrollHeight;
    });
  }
}
