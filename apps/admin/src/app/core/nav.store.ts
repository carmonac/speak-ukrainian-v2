import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CourseSummary, PageSummary } from '@speakukrainian/shared';
import { AdminApi } from './api';

/**
 * What the side menu lists: the custom pages and the courses. Editors call
 * `refresh…()` after saving so the menu follows without a reload.
 */
@Injectable({ providedIn: 'root' })
export class NavStore {
  private readonly api = inject(AdminApi);

  readonly pages = signal<PageSummary[]>([]);
  readonly courses = signal<CourseSummary[]>([]);
  readonly unreadMessages = signal(0);

  async refreshPages(): Promise<void> {
    const pages = await firstValueFrom(this.api.pages()).catch(() => null);
    if (pages) {
      this.pages.set(pages.filter((page) => !page.isMain));
    }
  }

  async refreshCourses(): Promise<void> {
    const courses = await firstValueFrom(this.api.courses()).catch(() => null);
    if (courses) {
      this.courses.set(courses);
    }
  }

  async refreshUnread(): Promise<void> {
    const stats = await firstValueFrom(this.api.dashboard()).catch(() => null);
    if (stats) {
      this.unreadMessages.set(stats.unreadMessages);
    }
  }

  refreshAll(): void {
    void this.refreshPages();
    void this.refreshCourses();
    void this.refreshUnread();
  }
}
