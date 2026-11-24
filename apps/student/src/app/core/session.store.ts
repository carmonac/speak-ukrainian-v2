import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MyCourseSummary, MyProfile } from '@speakukrainian/shared';
import { StudentApi } from './api';
import { AuthService } from './auth.service';

/** How often the unread badge asks the API for news while the tab is visible. */
const UNREAD_POLL_INTERVAL_MS = 20_000;

/**
 * What the shell and several screens need to know about the signed-in student:
 * their profile, the courses they own and how many messages are unread. Empty
 * while signed out; reloaded whenever the signed-in user changes.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(StudentApi);
  private readonly auth = inject(AuthService);

  readonly profile = signal<MyProfile | null>(null);
  readonly courses = signal<MyCourseSummary[]>([]);
  readonly unread = signal(0);

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

      // The unread badge is kept current by asking again now and then, and at
      // once when the tab comes back. A hidden tab does not poll: nobody is
      // looking at the badge, and the API should be allowed to go idle. The
      // open messages page polls its own thread, faster.
      const poll = (): void => {
        if (!document.hidden) {
          void this.refreshUnread();
        }
      };
      const timer = setInterval(poll, UNREAD_POLL_INTERVAL_MS);
      document.addEventListener('visibilitychange', poll);

      onCleanup(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', poll);
      });
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
