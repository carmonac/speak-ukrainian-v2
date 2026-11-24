import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/configuration.js';
import { SUPABASE_ADMIN, type SupabaseAdmin } from '../infra/supabase/supabase.module.js';
import { roleFromAppMetadata } from './authenticated-user.js';

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
    // Asked of Supabase Auth, which still owns the accounts (TASK-43 replaces
    // this whole service). One page is plenty: the admin is created first.
    const { data, error: listError } = await this.supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) {
      throw new Error(`listing users failed (${listError.message})`);
    }
    if (data.users.some((u) => roleFromAppMetadata(u.app_metadata) === 'admin')) {
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
