import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import {
  ArrowDownOutline,
  ArrowLeftOutline,
  ArrowUpOutline,
  BookOutline,
  DashboardOutline,
  DeleteOutline,
  EditOutline,
  EyeOutline,
  FileTextOutline,
  HomeOutline,
  LockOutline,
  LogoutOutline,
  MailOutline,
  MessageOutline,
  PlusOutline,
  SaveOutline,
  SendOutline,
  TeamOutline,
  UploadOutline,
  UserOutline,
} from '@ant-design/icons-angular/icons';
import { en_US, provideNzI18n } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { routes } from './app.routes';
import { authInterceptor } from './core/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideNzI18n(en_US),
    provideNzIcons([
      ArrowDownOutline,
      ArrowLeftOutline,
      ArrowUpOutline,
      BookOutline,
      DashboardOutline,
      DeleteOutline,
      EditOutline,
      EyeOutline,
      FileTextOutline,
      HomeOutline,
      LockOutline,
      LogoutOutline,
      MailOutline,
      MessageOutline,
      PlusOutline,
      SaveOutline,
      SendOutline,
      TeamOutline,
      UploadOutline,
      UserOutline,
    ]),
  ],
};
