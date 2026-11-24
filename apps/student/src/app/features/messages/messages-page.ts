import { DatePipe } from '@angular/common';
import { TextFieldModule } from '@angular/cdk/text-field';
import { Component, DestroyRef, type ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import type { Message } from '@speakukrainian/shared';
import { StudentApi } from '../../core/api';
import { errorMessage } from '../../core/http';
import { SessionStore } from '../../core/session.store';

/** The student's chat with the teacher, updated live. */
/** How often the open thread asks the API for new messages. */
const POLL_INTERVAL_MS = 5_000;

@Component({
  selector: 'app-messages-page',
  imports: [
    DatePipe,
    FormsModule,
    TextFieldModule,
    NzCardModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
    NzSpinModule,
  ],
  template: `
    <div class="page-header"><h1>Messages</h1></div>

    @if (error(); as message) {
      <nz-alert nzType="error" [nzMessage]="message" nzShowIcon class="alert" />
    }

    <nz-card>
      <nz-spin [nzSpinning]="loading()">
        <div #scroller class="thread" role="log" aria-live="polite">
          @for (message of messages(); track message.id) {
            <div class="bubble" [class.mine]="message.sender === 'student'">
              @if (message.lessonTitle) {
                <div class="context">
                  About: {{ message.courseTitle }} › {{ message.lessonTitle }}
                </div>
              }
              <div class="body">{{ message.body }}</div>
              <div class="meta">
                {{ message.sender === 'admin' ? 'Teacher · ' : ''
                }}{{ message.createdAt | date: 'short' }}
              </div>
            </div>
          } @empty {
            <p class="muted empty">
              No messages yet. Ask your teacher anything — you can also ask from inside a lesson.
            </p>
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
          maxlength="5000"
          placeholder="Write a message to your teacher…"
          aria-label="Message"
          (keydown.control.enter)="send()"
          (keydown.meta.enter)="send()"
        ></textarea>
        <button nz-button nzType="primary" [nzLoading]="sending()" [disabled]="!draft.trim()">
          <nz-icon nzType="send" />
          Send
        </button>
      </form>
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
      text-align: center;
    }
    .composer {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      border-top: 1px solid #f0f0f0;
      padding-top: 16px;
    }
  `,
})
export class MessagesPage {
  private readonly api = inject(StudentApi);
  private readonly session = inject(SessionStore);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly messages = signal<Message[]>([]);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected draft = '';

  constructor() {
    void this.refresh();

    // While the page is open the thread is re-read every few seconds, and at
    // once when the tab comes back. A hidden tab does not poll.
    const poll = (): void => {
      if (!document.hidden) {
        void this.refresh();
      }
    };
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    });
  }

  private async refresh(): Promise<void> {
    try {
      const messages = await firstValueFrom(this.api.messages());
      const grew = messages.length !== this.messages().length;
      this.messages.set(messages);
      this.error.set(null);
      if (messages.some((m) => m.sender === 'admin' && m.readAt === null)) {
        await firstValueFrom(this.api.markRead());
        void this.session.refreshUnread();
      }
      if (grew) {
        this.scrollToEnd();
      }
    } catch (error) {
      this.error.set(errorMessage(error, 'Your messages could not be loaded.'));
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
      const message = await firstValueFrom(this.api.sendMessage(body));
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
