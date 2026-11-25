import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  ConversationSummary,
  CourseDetail,
  CourseSummary,
  DashboardStats,
  Message,
  Page,
  PageDetail,
  PageSummary,
  PreviewPageInput,
  SaveCourseInput,
  SavePageInput,
  SendEmailInput,
  SiteFile,
  UpdateUserInput,
  UserDetail,
  UserSummary,
} from '@speakukrainian/shared';
import { ApiService } from './http';

/** Typed access to every admin endpoint of the API. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiService);

  dashboard(): Observable<DashboardStats & { unreadMessages: number }> {
    return this.api.get('/admin/dashboard');
  }

  // Pages
  pages(): Observable<PageSummary[]> {
    return this.api.get('/admin/pages');
  }
  mainPage(): Observable<PageDetail> {
    return this.api.get('/admin/pages/main');
  }
  page(id: string): Observable<PageDetail> {
    return this.api.get(`/admin/pages/${id}`);
  }
  createPage(input: SavePageInput): Observable<PageDetail> {
    return this.api.post('/admin/pages', input);
  }
  updatePage(id: string, input: SavePageInput): Observable<PageDetail> {
    return this.api.put(`/admin/pages/${id}`, input);
  }
  deletePage(id: string): Observable<void> {
    return this.api.delete(`/admin/pages/${id}`);
  }
  /** A short-lived link that shows unsaved content, to open in a tab of its own. */
  previewLink(input: Partial<PreviewPageInput>): Observable<{ url: string }> {
    return this.api.post('/admin/pages/preview-link', input);
  }

  // Site files
  uploadFile(file: File): Observable<SiteFile> {
    return this.api.upload('/admin/files', file);
  }
  files(query: { limit: number; offset: number }): Observable<Page<SiteFile>> {
    return this.api.get('/admin/files', { limit: query.limit, offset: query.offset });
  }
  deleteFile(id: string): Observable<void> {
    return this.api.delete(`/admin/files/${id}`);
  }

  // Courses
  courses(): Observable<CourseSummary[]> {
    return this.api.get('/admin/courses');
  }
  course(id: string): Observable<CourseDetail> {
    return this.api.get(`/admin/courses/${id}`);
  }
  createCourse(input: SaveCourseInput): Observable<CourseDetail> {
    return this.api.post('/admin/courses', input);
  }
  updateCourse(id: string, input: SaveCourseInput): Observable<CourseDetail> {
    return this.api.put(`/admin/courses/${id}`, input);
  }
  deleteCourse(id: string): Observable<void> {
    return this.api.delete(`/admin/courses/${id}`);
  }
  setLessonExercise(lessonId: string, h5pContentId: string | null): Observable<void> {
    return this.api.put(`/admin/lessons/${lessonId}/exercise`, { h5pContentId });
  }

  // Users
  users(query: { limit: number; offset: number; search?: string }): Observable<Page<UserSummary>> {
    const params: Record<string, string | number> = { limit: query.limit, offset: query.offset };
    if (query.search) {
      params['search'] = query.search;
    }
    return this.api.get('/admin/users', params);
  }
  user(id: string): Observable<UserDetail> {
    return this.api.get(`/admin/users/${id}`);
  }
  updateUser(id: string, input: UpdateUserInput): Observable<UserDetail> {
    return this.api.patch(`/admin/users/${id}`, input);
  }
  sendEmail(id: string, input: SendEmailInput): Observable<void> {
    return this.api.post(`/admin/users/${id}/email`, input);
  }

  // Chat
  conversations(): Observable<ConversationSummary[]> {
    return this.api.get('/admin/conversations');
  }
  messages(userId: string): Observable<Message[]> {
    return this.api.get(`/admin/users/${userId}/messages`);
  }
  sendMessage(userId: string, body: string): Observable<Message> {
    return this.api.post(`/admin/users/${userId}/messages`, { body });
  }
  markRead(userId: string): Observable<void> {
    return this.api.post(`/admin/users/${userId}/messages/read`, null);
  }
}
