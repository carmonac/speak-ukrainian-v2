import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MESSAGES_TABLE, type MyCourseSummary, type MyProfile } from '@speakukrainian/shared';
import { StudentApi } from './api';
import { AuthService } from './auth.service';
import { Supabase } from './supabase';

/**
 * What the shell and several screens need to know about the signed-in student:
 * their profile, the courses they own and how many messages are unread. Empty
 * while signed out; reloaded whenever the signed-in user changes.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(StudentApi);
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(Supabase).client;

  readonly profile = signal<MyProfile | null>(null);
  readonly courses = signal<MyCourseSummary[]>([]);
  readonly unread = signal(0);
  /** Bumped on every Realtime change to the student's thread. */
  readonly messagesChanged = signal(0);

  readonly displayName = computed(
    () => this.profile()?.fullName || this.auth.metadataName() || this.auth.email(),
  );
  readonly ownedCourseIds = computed(() => new Set(this.courses().map((course) => course.id)));

  constructor() {
    effect((onCleanup) => {
      const userId = this.auth.userId();
      untracked(() => {
        this.profile.set(null);
        this.courses.set([]);
        this.unread.set(0);
      });
      if (userId === null) {
        return;
      }

      untracked(() => {
        void this.refreshProfile();
        void this.refreshCourses();
        void this.refreshUnread();
      });

      // Realtime only says "something changed"; the numbers are re-read
      // through the API, which stays the single source of truth.
      const channel = this.supabase
        .channel(`student-thread-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: MESSAGES_TABLE,
            filter: `student_id=eq.${userId}`,
          },
          () => {
            this.messagesChanged.update((n) => n + 1);
            void this.refreshUnread();
          },
        )
        .subscribe();

      onCleanup(() => void this.supabase.removeChannel(channel));
    });
  }

  async refreshProfile(): Promise<void> {
    const profile = await firstValueFrom(this.api.profile()).catch(() => null);
    if (profile && profile.id === this.auth.userId()) {
      this.profile.set(profile);
    }
  }

  async refreshCourses(): Promise<void> {
    if (!this.auth.signedIn()) {
      return;
    }
    const courses = await firstValueFrom(this.api.myCourses()).catch(() => null);
    if (courses && this.auth.signedIn()) {
      this.courses.set(courses);
    }
  }

  async refreshUnread(): Promise<void> {
    if (!this.auth.signedIn()) {
      return;
    }
    const result = await firstValueFrom(this.api.unreadCount()).catch(() => null);
    if (result && this.auth.signedIn()) {
      this.unread.set(result.unread);
    }
  }
}
