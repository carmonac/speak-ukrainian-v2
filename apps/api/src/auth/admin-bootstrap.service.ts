import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/configuration.js';
import { DatabaseService } from '../infra/db/database.service.js';
import { SUPABASE_ADMIN, type SupabaseAdmin } from '../infra/supabase/supabase.module.js';

/**
 * Creates the single administrator the first time the API boots against a
 * project that has none.
 *
 * The generated password is written to the log exactly once, at creation. It
 * is never stored by this application; the admin can change it afterwards
 * through the password-reset flow.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AdminBootstrap');

  constructor(
    private readonly db: DatabaseService,
    @Inject(SUPABASE_ADMIN) private readonly supabase: SupabaseAdmin,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureAdmin();
    } catch (error) {
      // The API still serves the public site and students without an admin.
      this.logger.error(`Could not check or create the admin account: ${String(error)}`);
    }
  }

  private async ensureAdmin(): Promise<void> {
    const existing = await this.db.one(
      `select 1 from auth.users where raw_app_meta_data ->> 'role' = 'admin' limit 1`,
    );
    if (existing) {
      return;
    }

    const email = this.config.get('ADMIN_EMAIL', { infer: true });
    const password = randomBytes(18).toString('base64url');

    const { error } = await this.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'admin' },
      user_metadata: { full_name: 'Administrator' },
    });
    if (error) {
      throw new Error(
        `creating ${email} failed (${error.message}). If that address already belongs to a ` +
          'student account, delete it or choose another ADMIN_EMAIL.',
      );
    }

    this.logger.warn(
      [
        '',
        '================ ADMIN ACCOUNT CREATED ================',
        `  email:    ${email}`,
        `  password: ${password}`,
        '  This password is shown only once. Store it now.',
        '=======================================================',
        '',
      ].join('\n'),
    );
  }
}
