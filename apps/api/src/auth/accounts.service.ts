import { Inject, Injectable } from '@nestjs/common';
import type { UserRole } from '@speakukrainian/shared';
import { DatabaseService } from '../infra/db/database.service.js';
import { AUTH, type Auth } from './auth.js';
import { toRole, type AuthenticatedUser } from './authenticated-user.js';

interface AccountRow {
  id: string;
  email: string;
  role: string | null;
  banned: number | null;
  banExpires: string | null;
}

export interface Account extends AuthenticatedUser {
  role: UserRole;
  /** Banned right now: a ban with an expiry in the past no longer counts. */
  banned: boolean;
}

/** Reads accounts straight from the `user` table, for code that has no session. */
@Injectable()
export class AccountsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async findById(id: string): Promise<Account | null> {
    const row = await this.db.one<AccountRow>(
      'select id, email, role, banned, "banExpires" from "user" where id = ?1',
      [id],
    );
    return row
      ? {
          uid: row.id,
          email: row.email,
          role: toRole(row.role),
          banned: isBanned(row.banned, row.banExpires),
        }
      : null;
  }

  /**
   * Whether `password` is the account's current password. Asked of the stored
   * hash with the library's own verifier, so it is right however the password
   * was last set: the panel, a reset link, or by hand. False for an account
   * that has no password (one that only signs in with a social provider).
   */
  async hasPassword(userId: string, password: string): Promise<boolean> {
    const row = await this.db.one<{ password: string | null }>(
      `select password from account where "userId" = ?1 and "providerId" = 'credential'`,
      [userId],
    );
    if (!row?.password) {
      return false;
    }
    const context = await this.auth.$context;
    return context.password.verify({ hash: row.password, password });
  }

  async adminExists(): Promise<boolean> {
    return (await this.db.one(`select 1 from "user" where role = 'admin' limit 1`)) !== null;
  }

  async makeAdmin(id: string): Promise<void> {
    await this.db.query(`update "user" set role = 'admin' where id = ?1`, [id]);
  }
}

/** `banExpires` may be a Date (from better-auth) or ISO text (from SQL). */
export function isBanned(banned: unknown, banExpires: unknown): boolean {
  if (banned !== true && banned !== 1) {
    return false;
  }
  if (banExpires === null || banExpires === undefined) {
    return true;
  }
  const until = banExpires instanceof Date ? banExpires.getTime() : Date.parse(String(banExpires));
  return Number.isNaN(until) || until > Date.now();
}
