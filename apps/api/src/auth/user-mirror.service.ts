import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, now } from '../infra/db/database.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';

/**
 * TEMPORARY — remove with Supabase Auth (TASK-43).
 *
 * Application data lives in D1, where every per-user row references the
 * `user` table, but accounts are still created by Supabase Auth in its own
 * database. Until better-auth owns `user`, each account is copied into it the
 * first time the API sees it authenticated, so foreign keys and the joins that
 * used to read `auth.users` keep working.
 */
@Injectable()
export class UserMirrorService {
  private readonly logger = new Logger(UserMirrorService.name);

  async sync(user: AuthenticatedUser, fullName = ''): Promise<void> {
    const at = now();
    try {
      await this.db.batch([
        {
          sql: `insert into "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
                values (?1, ?2, ?3, 1, ?4, ?5, ?5)
                on conflict (id) do update set email = excluded.email, role = excluded.role`,
          params: [user.uid, fullName, user.email ?? `${user.uid}@unknown.invalid`, user.role, at],
        },
        // What the `on_auth_user_created` trigger did in Postgres.
        {
          sql: 'insert into profiles (id, full_name) values (?1, ?2) on conflict (id) do nothing',
          params: [user.uid, fullName],
        },
      ]);
    } catch (error) {
      // The request may still succeed if it touches no per-user table.
      this.logger.error(`Could not mirror user ${user.uid} into D1: ${String(error)}`);
    }
  }

  constructor(private readonly db: DatabaseService) {}
}
