import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CheckoutResult,
  CourseOutline,
  CourseSummary,
  LessonProgress,
  LessonResultInput,
  Message,
  MyCourseDetail,
  MyCourseSummary,
  MyProfile,
} from '@speakukrainian/shared';
import { ApiService } from './http';

/** Typed access to the endpoints the classroom uses. */
@Injectable({ providedIn: 'root' })
export class StudentApi {
  private readonly api = inject(ApiService);

  // Public catalogue
  courses(): Observable<CourseSummary[]> {
    return this.api.get('/courses');
  }
  course(slug: string): Observable<CourseOutline> {
    return this.api.get(`/courses/${encodeURIComponent(slug)}`);
  }

  // Account
  profile(): Observable<MyProfile> {
    return this.api.get('/me/profile');
  }
  updateProfile(fullName: string): Observable<MyProfile> {
    return this.api.patch('/me/profile', { fullName });
  }

  // My courses
  myCourses(): Observable<MyCourseSummary[]> {
    return this.api.get('/me/courses');
  }
  myCourse(id: string): Observable<MyCourseDetail> {
    return this.api.get(`/me/courses/${id}`);
  }
  checkout(courseId: string): Observable<CheckoutResult> {
    return this.api.post('/me/checkout', { courseId });
  }
  recordResult(lessonId: string, result: LessonResultInput): Observable<LessonProgress> {
    return this.api.post(`/me/lessons/${lessonId}/result`, result);
  }

  // Chat with the teacher
  messages(): Observable<Message[]> {
    return this.api.get('/me/messages');
  }
  unreadCount(): Observable<{ unread: number }> {
    return this.api.get('/me/messages/unread-count');
  }
  sendMessage(body: string, lessonId?: string | null): Observable<Message> {
    return this.api.post('/me/messages', lessonId ? { body, lessonId } : { body });
  }
  markRead(): Observable<void> {
    return this.api.post('/me/messages/read', null);
  }
}
