import type { Routes } from '@angular/router';
import { adminGuard, signedOutGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    // Reached from a password-reset e-mail, signed in or not.
    path: 'reset-password',
    loadComponent: () =>
      import('./features/login/reset-password-page').then((m) => m.ResetPasswordPage),
  },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'pages/main',
        data: { mode: 'main' },
        loadComponent: () => import('./features/pages/page-editor').then((m) => m.PageEditor),
      },
      {
        path: 'pages/new',
        data: { mode: 'new' },
        loadComponent: () => import('./features/pages/page-editor').then((m) => m.PageEditor),
      },
      {
        path: 'pages/:id',
        data: { mode: 'edit' },
        loadComponent: () => import('./features/pages/page-editor').then((m) => m.PageEditor),
      },
      {
        path: 'courses/new',
        loadComponent: () => import('./features/courses/course-editor').then((m) => m.CourseEditor),
      },
      {
        path: 'courses/:id',
        loadComponent: () => import('./features/courses/course-editor').then((m) => m.CourseEditor),
      },
      {
        // No query parameters on this route, ever: the H5P editor appends
        // `location.search` to every AJAX URL it builds.
        path: 'courses/:courseId/lessons/:lessonId/exercise',
        loadComponent: () =>
          import('./features/courses/exercise-editor').then((m) => m.ExerciseEditor),
      },
      {
        path: 'account',
        loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage),
      },
      {
        path: 'storage',
        loadComponent: () => import('./features/storage/storage-page').then((m) => m.StoragePage),
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users-page').then((m) => m.UsersPage),
      },
      {
        path: 'users/:id',
        loadComponent: () => import('./features/users/user-detail').then((m) => m.UserDetailPage),
      },
      {
        path: 'users/:id/conversation',
        loadComponent: () =>
          import('./features/users/conversation-page').then((m) => m.ConversationPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
