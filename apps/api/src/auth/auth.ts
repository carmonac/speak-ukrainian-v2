import { betterAuth } from 'better-auth';
import { admin, bearer } from 'better-auth/plugins';
import { DatabaseService, now, type SqlParam } from '../infra/db/database.service.js';

/** Everything `createAuth` needs from the rest of the application. */
export interface AuthDependencies {
  db: DatabaseService;
  /** Signs session tokens. At least 32 random characters. */
  secret: string;
  /** Public origin of this API, e.g. `https://speakukrainian.org`. */
  baseUrl: string;
  /** Origins of the admin panel and the student classroom. */
  trustedOrigins: string[];
  studentAppUrl: string;
  adminAppUrl: string;
  production: boolean;
  sendEmail(email: {
    to: string;
    userId: string;
    subject: string;
    text: string;
    kind: string;
  }): Promise<void>;
  onError(message: string): void;
}

/** Where better-auth's own routes live: sign-up, sign-in, reset… */
export const AUTH_BASE_PATH = '/api/auth';

/** Shorter than better-auth's default of 8 would allow; the admin's first password has 8. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Accounts and sessions, by better-auth, stored in D1.
 *
 * - **E-mail and password only**, for now. Google and Apple are prepared below.
 * - **Bearer tokens, not cookies**, are what the two apps use: each keeps its
 *   own token, so an administrator and a student can be signed in side by
 *   side in one browser. The token is returned in the `set-auth-token`
 *   response header of a sign-in or sign-up.
 * - **Roles** are `admin` and `student` (the default). The role is not
 *   writable through sign-up or profile updates; only an administrator or the
 *   database can change it.
 */
export function createAuth(deps: AuthDependencies) {
  const { db } = deps;

  return betterAuth({
    secret: deps.secret,
    baseURL: deps.baseUrl,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: deps.trustedOrigins,
    // D1 has no interactive transactions; the adapter detects that from the
    // shape of this object and never asks for one.
    database: d1Like(db),

    advanced: {
      // Route parameters are validated as UUIDs across the API.
      database: { generateId: 'uuid' },
      useSecureCookies: deps.production,
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      // Nobody has to confirm their address before using the classroom.
      requireEmailVerification: false,
      // Whoever resets a password ends every existing session of the account.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const role = (user as { role?: string }).role;
        const app = role === 'admin' ? deps.adminAppUrl : deps.studentAppUrl;
        const link = `${app.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
        // Not awaited: how long the request takes must not reveal whether the
        // address belongs to an account.
        void deps
          .sendEmail({
            to: user.email,
            userId: user.id,
            kind: 'password-reset',
            subject: 'Reset your SpeakUkrainian password',
            text:
              `Hello,\n\nUse this link to choose a new password. It works once and expires in one hour.\n\n` +
              `${link}\n\nIf you did not ask for it, you can ignore this message.\n`,
          })
          .catch((error: unknown) =>
            deps.onError(`Could not send a password reset e-mail: ${String(error)}`),
          );
      },
    },

    /*
     * Social sign-in — prepared, switched off for the first version.
     *
     * To enable a provider: uncomment it, add its variables to
     * `config/configuration.ts` and to the deployment secrets, and register
     * the callback URL with the provider. Accounts are linked by e-mail, so
     * someone who registered with a password can later use Google with the
     * same address.
     *
     * Google — https://console.cloud.google.com/apis/credentials
     *   Authorised redirect URI: https://speakukrainian.org/api/auth/callback/google
     *   (local: http://localhost:8080/api/auth/callback/google)
     *
     * Apple — https://developer.apple.com/account/resources/identifiers
     *   Return URL: https://speakukrainian.org/api/auth/callback/apple
     *   (Apple does not accept localhost.) `clientId` is the Services ID.
     *   `clientSecret` is not a static string: it is a JWT signed with the
     *   .p8 key (ES256) that Apple rejects after six months, so it has to be
     *   regenerated on a schedule. Apple also needs its origin trusted:
     *   add 'https://appleid.apple.com' to `trustedOrigins` above.
     *
     * socialProviders: {
     *   google: {
     *     clientId: deps.googleClientId,         // GOOGLE_CLIENT_ID
     *     clientSecret: deps.googleClientSecret, // GOOGLE_CLIENT_SECRET
     *   },
     *   apple: {
     *     clientId: deps.appleClientId,          // APPLE_CLIENT_ID
     *     clientSecret: deps.appleClientSecret,  // APPLE_CLIENT_SECRET
     *   },
     * },
     */

    databaseHooks: {
      user: {
        create: {
          // Every account has a profile row; the panel and the classroom read it.
          after: async (user) => {
            await db.query(
              'insert into profiles (id, full_name) values (?1, ?2) on conflict (id) do nothing',
              [user.id, user.name ?? ''],
            );
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await db
              .query('update "user" set "lastSignInAt" = ?2 where id = ?1', [session.userId, now()])
              .catch((error: unknown) =>
                deps.onError(`Could not record a sign-in: ${String(error)}`),
              );
          },
        },
      },
    },

    plugins: [
      bearer(),
      // Adds `role`, `banned`, `banReason` and `banExpires` to the user, refuses
      // sign-in to banned accounts, and gives administrators ban/unban routes.
      admin({ defaultRole: 'student', adminRoles: ['admin'] }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Injection token for the `Auth` instance. */
export const AUTH = Symbol('AUTH');

interface D1Result {
  results: Record<string, unknown>[];
  success: true;
  meta: { changes: number };
}

interface D1Statement {
  readonly sql: string;
  readonly params: SqlParam[];
  bind(...params: unknown[]): D1Statement;
  all(): Promise<D1Result>;
}

/**
 * The slice of Cloudflare's `D1Database` that better-auth's adapter uses,
 * on top of `DatabaseService` (and therefore of the gateway bridge).
 */
export function d1Like(db: DatabaseService) {
  const statement = (sql: string, params: SqlParam[]): D1Statement => ({
    sql,
    params,
    bind: (...values) => statement(sql, values.map(toParam)),
    all: async () => toD1(await db.query(sql, params)),
  });

  return {
    prepare: (sql: string) => statement(sql, []),
    batch: async (statements: D1Statement[]) =>
      (await db.batch(statements.map(({ sql, params }) => ({ sql, params })))).map(toD1),
    // Only better-auth's own migration tool calls this; the schema here comes
    // from apps/gateway/migrations.
    exec: async (): Promise<never> => {
      throw new Error('exec() is not available: apply schema changes as D1 migrations.');
    },
  };
}

function toD1(result: { rows: Record<string, unknown>[]; rowCount: number }): D1Result {
  return { results: result.rows, success: true, meta: { changes: result.rowCount } };
}

function toParam(value: unknown): SqlParam {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}
