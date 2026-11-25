/**
 * The real better-auth library on the D1 schema (in-memory SQLite), through
 * the same shim the running API uses. Requests go to `auth.handler`, exactly
 * what `main.ts` mounts under /api/auth.
 */
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/configuration.js';
import type { H5pUrlTokenService } from '../h5p/h5p-url-token.service.js';
import { H5pUrlTokenGuard } from '../h5p/h5p-url-token.guard.js';
import { H5P_URL_TOKEN_KEY } from '../h5p/h5p.url-token.decorator.js';
import { createTestDatabase, type TestDatabase } from '../infra/db/sqlite.test-driver.js';
import { AccountsService } from './accounts.service.js';
import { AdminAccountController } from './admin-account.controller.js';
import { AdminBootstrapService, DEFAULT_ADMIN_PASSWORD } from './admin-bootstrap.service.js';
import { AUTH_BASE_PATH, createAuth, type Auth } from './auth.js';
import type { RequestWithUser } from './authenticated-user.js';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { SessionAuthGuard } from './session-auth.guard.js';

const ORIGIN = 'http://localhost:4300';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** What the routes used here answer with; `user` is present on sign-up and sign-in. */
interface AuthBody {
  user: { id: string; email: string; name: string };
}

interface SentEmail {
  to: string;
  userId: string;
  subject: string;
  text: string;
  kind: string;
}

describe('authentication', () => {
  let t: TestDatabase;
  let auth: Auth;
  let emails: SentEmail[];
  let errors: string[];

  /** Calls one of better-auth's routes the way a browser would. */
  async function call(
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{ status: number; body: AuthBody; token: string | null }> {
    const response = await auth.handler(
      new Request(`http://localhost:8080${AUTH_BASE_PATH}${path}`, {
        method: body === undefined && !path.startsWith('/sign-out') ? 'GET' : 'POST',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body:
          body === undefined
            ? path.startsWith('/sign-out')
              ? '{}'
              : undefined
            : JSON.stringify(body),
      }),
    );
    const text = await response.text();
    return {
      status: response.status,
      body: (text ? JSON.parse(text) : {}) as AuthBody,
      token: response.headers.get('set-auth-token'),
    };
  }

  const signUp = (email: string, password = 'correct horse', name = 'Ana López') =>
    call('/sign-up/email', { email, password, name });
  const signIn = (email: string, password = 'correct horse') =>
    call('/sign-in/email', { email, password });

  /** A guard's view of a request carrying `token`, on a route with `metadata`. */
  function context(token: string | undefined, metadata: Record<string, unknown> = {}) {
    const request = {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    } as RequestWithUser;
    const executionContext = {
      getHandler: () => context,
      getClass: () => context,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const reflector = {
      getAllAndOverride: (key: string) => metadata[key],
    } as unknown as Reflector;
    return { request, executionContext, reflector };
  }

  async function authenticate(token: string | undefined, metadata: Record<string, unknown> = {}) {
    const { request, executionContext, reflector } = context(token, metadata);
    await new SessionAuthGuard(auth, reflector).canActivate(executionContext);
    return request.user;
  }

  beforeEach(() => {
    t = createTestDatabase();
    emails = [];
    errors = [];
    auth = createAuth({
      db: t.db,
      secret: 'test-secret-test-secret-test-secret-1234',
      baseUrl: 'http://localhost:8080',
      trustedOrigins: [ORIGIN, 'http://localhost:4200'],
      studentAppUrl: 'http://localhost:4300/',
      adminAppUrl: 'http://localhost:4200',
      production: false,
      sendEmail: async (email) => void emails.push(email),
      onError: (message) => void errors.push(message),
    });
  });

  describe('sign-up', () => {
    it('creates a student with a UUID, a profile row and a session token', async () => {
      const result = await signUp('ana@example.com');
      expect(result.status).toBe(200);
      expect(result.token).toEqual(expect.any(String));
      expect(result.body.user).toMatchObject({ email: 'ana@example.com', name: 'Ana López' });
      expect(result.body.user.id).toMatch(UUID);

      expect(t.all('select id, email, role, banned, "createdAt" from "user"')).toEqual([
        {
          id: result.body.user.id,
          email: 'ana@example.com',
          role: 'student',
          banned: 0,
          createdAt: expect.stringMatching(ISO),
        },
      ]);
      expect(t.all('select id, full_name, locale from profiles')).toEqual([
        { id: result.body.user.id, full_name: 'Ana López', locale: 'en' },
      ]);
      // The password is stored hashed, never as typed.
      const [account] = t.all<{ providerId: string; password: string }>(
        'select "providerId", password from account',
      );
      expect(account?.providerId).toBe('credential');
      expect(account?.password).not.toContain('correct horse');
    });

    it('never lets the caller choose a role', async () => {
      const result = await call('/sign-up/email', {
        email: 'sneaky@example.com',
        password: 'correct horse',
        name: 'Sneaky',
        role: 'admin',
      });
      // Refused outright, or accepted with the field ignored: never an admin.
      expect(t.all(`select count(*) as n from "user" where role = 'admin'`)).toEqual([{ n: 0 }]);
      expect([200, 400, 422]).toContain(result.status);
    });

    it('refuses a duplicate address and a password that is too short', async () => {
      await signUp('ana@example.com');
      expect((await signUp('ana@example.com')).status).toBeGreaterThanOrEqual(400);
      expect((await signUp('bo@example.com', 'short')).status).toBe(400);
      expect(t.all('select count(*) as n from "user"')).toEqual([{ n: 1 }]);
    });
  });

  describe('sign-in and sessions', () => {
    it('signs in with the right password only, and records when', async () => {
      await signUp('ana@example.com');
      expect((await signIn('ana@example.com', 'wrong password')).status).toBe(401);
      expect((await signIn('nobody@example.com')).status).toBe(401);

      const result = await signIn('ana@example.com');
      expect(result.status).toBe(200);
      expect(result.token).toEqual(expect.any(String));
      expect(t.all('select "lastSignInAt" from "user"')).toEqual([
        { lastSignInAt: expect.stringMatching(ISO) },
      ]);
      expect(errors).toEqual([]);
    });

    it('identifies the caller of a protected route from the bearer token', async () => {
      const { token, body } = await signUp('ana@example.com');
      expect(await authenticate(token!)).toEqual({
        uid: body.user.id,
        email: 'ana@example.com',
        role: 'student',
      });
    });

    it('answers 401 without a token, with a made-up one, and after sign-out', async () => {
      const { token } = await signUp('ana@example.com');

      await expect(authenticate(undefined)).rejects.toThrow(
        new UnauthorizedException('Missing bearer token'),
      );
      await expect(authenticate('not-a-session')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );

      expect((await call('/sign-out', undefined, token!)).status).toBe(200);
      await expect(authenticate(token!)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('answers 401 for an expired session', async () => {
      const { token } = await signUp('ana@example.com');
      t.all(`update session set "expiresAt" = '2020-01-01T00:00:00.000Z' returning id`);
      await expect(authenticate(token!)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('keeps two sessions independent: signing one out leaves the other', async () => {
      const first = await signUp('ana@example.com');
      const second = await signIn('ana@example.com');
      await call('/sign-out', undefined, first.token!);
      await expect(authenticate(first.token!)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(await authenticate(second.token!)).toMatchObject({ email: 'ana@example.com' });
    });

    it('lets public routes through and treats optional auth as anonymous when the token is bad', async () => {
      expect(await authenticate(undefined, { [IS_PUBLIC_KEY]: true })).toBeUndefined();
      expect(await authenticate(undefined, { [IS_OPTIONAL_AUTH_KEY]: true })).toBeUndefined();
      expect(await authenticate('garbage', { [IS_OPTIONAL_AUTH_KEY]: true })).toBeUndefined();

      const { token } = await signUp('ana@example.com');
      expect(await authenticate(token!, { [IS_OPTIONAL_AUTH_KEY]: true })).toMatchObject({
        email: 'ana@example.com',
      });
    });
  });

  describe('roles', () => {
    function authorize(user: RequestWithUser['user'], roles: string[]) {
      const { request, executionContext, reflector } = context(undefined, { [ROLES_KEY]: roles });
      request.user = user;
      return new RolesGuard(reflector).canActivate(executionContext);
    }

    it('keeps a student out of admin routes and lets an administrator in', async () => {
      const { token, body } = await signUp('ana@example.com');
      const student = await authenticate(token!);
      expect(() => authorize(student, ['admin'])).toThrow(ForbiddenException);
      expect(authorize(student, ['student'])).toBe(true);

      await new AccountsService(t.db, auth).makeAdmin(body.user.id);
      // The same token: the role is read on every request.
      const admin = await authenticate(token!);
      expect(admin?.role).toBe('admin');
      expect(authorize(admin, ['admin'])).toBe(true);
    });

    it("does not open better-auth's own admin routes to a student", async () => {
      const { token } = await signUp('ana@example.com');
      const result = await call('/admin/list-users', undefined, token!);
      expect([401, 403]).toContain(result.status);
    });
  });

  describe('bans', () => {
    it('refuses a banned account on its next request and at sign-in', async () => {
      const { token } = await signUp('ana@example.com');
      t.all(`update "user" set banned = 1, "banReason" = 'spam' returning id`);

      await expect(authenticate(token!)).rejects.toBeInstanceOf(UnauthorizedException);
      expect((await signIn('ana@example.com')).status).toBeGreaterThanOrEqual(400);
    });

    it('lets the account back in once the ban has expired', async () => {
      const { token } = await signUp('ana@example.com');
      t.all(`update "user" set banned = 1, "banExpires" = '2020-01-01T00:00:00.000Z' returning id`);
      expect(await authenticate(token!)).toMatchObject({ email: 'ana@example.com' });
    });

    it('lets an administrator ban a student through the API, ending their sessions', async () => {
      const admin = await signUp('admin@example.com');
      await new AccountsService(t.db, auth).makeAdmin(admin.body.user.id);
      const student = await signUp('ana@example.com');

      const banned = await call('/admin/ban-user', { userId: student.body.user.id }, admin.token!);
      expect(banned.status).toBe(200);
      await expect(authenticate(student.token!)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(await authenticate(admin.token!)).toMatchObject({ role: 'admin' });
    });

    it('refuses H5P URL tokens of banned, deleted or unknown accounts', async () => {
      const { body } = await signUp('ana@example.com');
      const uid: string = body.user.id;
      const tokens = {
        verify: (token: string) => ({ ok: true, uid: token }),
      } as unknown as H5pUrlTokenService;

      const identify = async (tokenUid: string) => {
        const { request, executionContext, reflector } = context(undefined, {
          [H5P_URL_TOKEN_KEY]: true,
        });
        (request as unknown as { query: Record<string, string>; params: object }).query = {
          token: tokenUid,
        };
        (request as unknown as { params: object }).params = {};
        await new H5pUrlTokenGuard(reflector, tokens, new AccountsService(t.db, auth)).canActivate(
          executionContext,
        );
        return request.user;
      };

      expect(await identify(uid)).toEqual({ uid, email: 'ana@example.com', role: 'student' });
      await expect(identify('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      t.all(`update "user" set banned = 1 returning id`);
      await expect(identify(uid)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('passwords', () => {
    const tokenIn = (email: SentEmail) => /token=([^\s&]+)/.exec(email.text)![1]!;

    it('resets a password by e-mail and ends the existing sessions', async () => {
      const { token: oldSession, body } = await signUp('ana@example.com');

      const requested = await call('/request-password-reset', { email: 'ana@example.com' });
      expect(requested.status).toBe(200);
      await expect.poll(() => emails.length).toBe(1);
      expect(emails[0]).toMatchObject({
        to: 'ana@example.com',
        userId: body.user.id,
        kind: 'password-reset',
      });
      expect(emails[0]!.text).toContain('http://localhost:4300/reset-password?token=');

      const reset = await call('/reset-password', {
        token: decodeURIComponent(tokenIn(emails[0]!)),
        newPassword: 'a brand new one',
      });
      expect(reset.status).toBe(200);

      expect((await signIn('ana@example.com')).status).toBe(401);
      expect((await signIn('ana@example.com', 'a brand new one')).status).toBe(200);
      await expect(authenticate(oldSession!)).rejects.toBeInstanceOf(UnauthorizedException);

      // The link works once.
      const again = await call('/reset-password', {
        token: decodeURIComponent(tokenIn(emails[0]!)),
        newPassword: 'yet another one',
      });
      expect(again.status).toBeGreaterThanOrEqual(400);
    });

    it('answers the same for an unknown address, and sends nothing', async () => {
      const result = await call('/request-password-reset', { email: 'nobody@example.com' });
      expect(result.status).toBe(200);
      expect(emails).toEqual([]);
    });

    it("sends an administrator's reset link to the admin panel", async () => {
      const admin = await signUp('admin@example.com');
      await new AccountsService(t.db, auth).makeAdmin(admin.body.user.id);
      await call('/request-password-reset', { email: 'admin@example.com' });
      await expect.poll(() => emails.length).toBe(1);
      expect(emails[0]!.text).toContain('http://localhost:4200/reset-password?token=');
    });

    it('changes a password when the current one is given', async () => {
      const { token } = await signUp('ana@example.com');
      const wrong = await call(
        '/change-password',
        { currentPassword: 'not it', newPassword: 'a brand new one' },
        token!,
      );
      expect(wrong.status).toBeGreaterThanOrEqual(400);

      const changed = await call(
        '/change-password',
        { currentPassword: 'correct horse', newPassword: 'a brand new one' },
        token!,
      );
      expect(changed.status).toBe(200);
      expect((await signIn('ana@example.com')).status).toBe(401);
      expect((await signIn('ana@example.com', 'a brand new one')).status).toBe(200);
    });
  });

  describe('first-run administrator', () => {
    const config = {
      get: (key: string) => (key === 'ADMIN_EMAIL' ? 'owner@example.com' : undefined),
    } as unknown as ConfigService<Env, true>;
    const bootstrap = () =>
      new AdminBootstrapService(auth, new AccountsService(t.db, auth), config);

    it('creates the administrator with the default password when there is none', async () => {
      await bootstrap().ensureAdmin();

      expect(t.all('select email, role from "user"')).toEqual([
        { email: 'owner@example.com', role: 'admin' },
      ]);
      const session = await signIn('owner@example.com', DEFAULT_ADMIN_PASSWORD);
      expect(session.status).toBe(200);
      expect(await authenticate(session.token!)).toMatchObject({ role: 'admin' });
    });

    it('does nothing when an administrator already exists, and never resets a password', async () => {
      await bootstrap().ensureAdmin();
      const session = await signIn('owner@example.com', DEFAULT_ADMIN_PASSWORD);
      await call(
        '/change-password',
        { currentPassword: DEFAULT_ADMIN_PASSWORD, newPassword: 'changed by the owner' },
        session.token!,
      );

      await bootstrap().ensureAdmin();
      expect(await bootstrap().ensureAdminWithRetries(1, 0)).toBe(true);

      expect(t.all('select count(*) as n from "user"')).toEqual([{ n: 1 }]);
      expect((await signIn('owner@example.com', DEFAULT_ADMIN_PASSWORD)).status).toBe(401);
      expect((await signIn('owner@example.com', 'changed by the owner')).status).toBe(200);
    });

    it('reports the default password until it is changed, by whatever means', async () => {
      await bootstrap().ensureAdmin();
      const session = await signIn('owner@example.com', DEFAULT_ADMIN_PASSWORD);
      const admin = (await authenticate(session.token!))!;
      const controller = new AdminAccountController(new AccountsService(t.db, auth));

      expect(await controller.account(admin)).toEqual({
        email: 'owner@example.com',
        usesDefaultPassword: true,
      });

      await call(
        '/change-password',
        { currentPassword: DEFAULT_ADMIN_PASSWORD, newPassword: 'changed by the owner' },
        session.token!,
      );
      expect((await controller.account(admin)).usesDefaultPassword).toBe(false);

      // Back to the default through a reset link: the warning returns.
      await call('/request-password-reset', { email: 'owner@example.com' });
      await expect.poll(() => emails.length).toBe(1);
      const token = decodeURIComponent(/token=([^\s&]+)/.exec(emails[0]!.text)![1]!);
      await call('/reset-password', { token, newPassword: DEFAULT_ADMIN_PASSWORD });
      expect((await controller.account(admin)).usesDefaultPassword).toBe(true);
    });

    it('never writes a password to the log', async () => {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
      const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(capture),
      );
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        lines.push(String(chunk));
        return true;
      });
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        lines.push(String(chunk));
        return true;
      });
      try {
        await bootstrap().ensureAdminWithRetries(1, 0);
        await signIn('owner@example.com', 'a wrong guess');
      } finally {
        [...spies, stdout, stderr].forEach((spy) => spy.mockRestore());
      }

      expect(lines.join('\n')).toContain('owner@example.com');
      expect(lines.join('\n')).not.toContain(DEFAULT_ADMIN_PASSWORD);
      expect(lines.join('\n')).not.toContain('a wrong guess');
    });

    it('keeps trying while the database is not ready, then creates the administrator', async () => {
      const accounts = new AccountsService(t.db, auth);
      let failures = 2;
      const flaky = Object.assign(Object.create(accounts) as AccountsService, {
        adminExists: async () => {
          if (failures-- > 0) throw new Error('no such table: user');
          return accounts.adminExists();
        },
      });
      const service = new AdminBootstrapService(auth, flaky, config);

      expect(await service.ensureAdminWithRetries(5, 0)).toBe(true);
      expect(t.all('select email, role from "user"')).toEqual([
        { email: 'owner@example.com', role: 'admin' },
      ]);
    });

    it('gives up after its attempts without throwing', async () => {
      const broken = { adminExists: async () => Promise.reject(new Error('down')) };
      const service = new AdminBootstrapService(auth, broken as unknown as AccountsService, config);
      expect(await service.ensureAdminWithRetries(3, 0)).toBe(false);
    });

    it('fails with an explanation when the address belongs to a student', async () => {
      await signUp('owner@example.com');
      await expect(bootstrap().ensureAdmin()).rejects.toThrow(/choose another ADMIN_EMAIL/);
      expect(t.all(`select count(*) as n from "user" where role = 'admin'`)).toEqual([{ n: 0 }]);
    });
  });
});
