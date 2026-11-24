import type { Routes } from '@angular/router';
import { authGuard, signedOutGuard } from './core/auth.guard';

const catalogue = () => import('./features/catalogue/catalogue-page').then((m) => m.CataloguePage);
const player = () => import('./features/my-courses/course-player').then((m) => m.CoursePlayer);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: catalogue },
      { path: 'courses', loadComponent: catalogue },
      {
        path: 'courses/:slug',
        loadComponent: () => import('./features/catalogue/course-page').then((m) => m.CoursePage),
      },
      {
        path: 'login',
        canActivate: [signedOutGuard],
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        canActivate: [signedOutGuard],
        loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
      },
      {
        // Reached from the link in the reset email: `/reset-password?token=…`.
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
      },
      {
        path: 'my-courses',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/my-courses/my-courses-page').then((m) => m.MyCoursesPage),
      },
      { path: 'my-courses/:courseId', canActivate: [authGuard], loadComponent: player },
      {
        path: 'my-courses/:courseId/lessons/:lessonId',
        canActivate: [authGuard],
        loadComponent: player,
      },
      {
        path: 'messages',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/messages/messages-page').then((m) => m.MessagesPage),
      },
      {
        path: 'account',
        canActivate: [authGuard],
        loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
