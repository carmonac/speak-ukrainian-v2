import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/configuration.js';
import { EmailService } from '../email/email.service.js';
import { DatabaseService } from '../infra/db/database.service.js';
import { AccountsService } from './accounts.service.js';
import { AdminAccountController } from './admin-account.controller.js';
import { AdminBootstrapService } from './admin-bootstrap.service.js';
import { AUTH, createAuth, type Auth } from './auth.js';
import { RolesGuard } from './roles.guard.js';
import { SessionAuthGuard } from './session-auth.guard.js';

@Global()
@Module({
  controllers: [AdminAccountController],
  providers: [
    {
      provide: AUTH,
      inject: [DatabaseService, ConfigService, EmailService],
      useFactory: (
        db: DatabaseService,
        config: ConfigService<Env, true>,
        email: EmailService,
      ): Auth => {
        const logger = new Logger('Auth');
        const admin = config.get('ADMIN_APP_URL', { infer: true });
        const student = config.get('STUDENT_APP_URL', { infer: true });
        return createAuth({
          db,
          secret: config.get('AUTH_SECRET', { infer: true }),
          baseUrl: config.get('PUBLIC_SITE_URL', { infer: true }),
          trustedOrigins: [...config.get('CORS_ORIGINS', { infer: true }), admin, student],
          studentAppUrl: student,
          adminAppUrl: admin,
          production: config.get('NODE_ENV', { infer: true }) === 'production',
          sendEmail: (message) => email.send(message),
          onError: (message) => logger.error(message),
        });
      },
    },
    AccountsService,
    SessionAuthGuard,
    RolesGuard,
    AdminBootstrapService,
  ],
  exports: [AUTH, AccountsService, SessionAuthGuard, RolesGuard],
})
export class AuthModule {}
