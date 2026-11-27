import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import { SessionAuthGuard } from './auth/session-auth.guard.js';
import { CacheControlInterceptor } from './common/cache-control.interceptor.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { validateEnv } from './config/configuration.js';
import { CouponsModule } from './coupons/coupons.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { EmailModule } from './email/email.module.js';
import { H5pUrlTokenGuard } from './h5p/h5p-url-token.guard.js';
import { FilesModule } from './files/files.module.js';
import { H5pModule } from './h5p/h5p.module.js';
import { HealthController } from './health/health.controller.js';
import { ClockModule } from './infra/clock/clock.module.js';
import { BridgeModule } from './infra/bridge/bridge.module.js';
import { DatabaseModule } from './infra/db/database.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { MeModule } from './me/me.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { PagesModule } from './pages/pages.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Root module.
 *
 * Authentication is global-by-default: every route requires a valid session
 * token unless it is explicitly marked `@Public()`. Administrator
 * routes additionally carry `@Roles('admin')`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    BridgeModule,
    DatabaseModule,
    ClockModule,
    StorageModule,
    AuthModule,
    EmailModule,
    MessagesModule,
    H5pModule,
    FilesModule,
    PagesModule,
    CoursesModule,
    CouponsModule,
    PaymentsModule,
    UsersModule,
    MeModule,
  ],
  controllers: [HealthController, DashboardController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    // The order of these three is load-bearing: Nest applies global guards in
    // registration order. The URL-token guard identifies the H5P editor's own
    // requests (which cannot send an Authorization header) before the bearer
    // guard would refuse them; the roles guard then authorizes whoever was
    // identified, by either means.
    { provide: APP_GUARD, useExisting: H5pUrlTokenGuard },
    { provide: APP_GUARD, useExisting: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
