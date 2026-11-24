import { Injectable, computed, signal } from '@angular/core';
import type { AdminAccount } from '@speakukrainian/shared';
import { runtimeConfig } from './runtime-config';

export const NOT_AN_ADMIN = 'This account is not the administrator.';

/** The API refuses anything shorter. */
export const MIN_PASSWORD_LENGTH = 8;

/** Only the control panel reads this key; the student classroom keeps its own. */
const STORAGE_KEY = 'su-admin-session';

/** Thrown for failures the user can do something about; the message is shown as is. */
export class AuthError extends Error {}

/**
 * Sign-in state of the control panel. Only the administrator may hold a
 * session here.
 *
 * Talks to the API's authentication routes (`/api/auth/*`) directly. The
 * session is a token sent as `Authorization: Bearer`; cookies are never sent,
 * which keeps this session separate from the one of the student classroom
 * open in the same browser.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = runtimeConfig().apiUrl;
  private readonly account = signal<AdminAccount | null>(null);
  private token: string | null = readStoredToken();
  private readonly initialised: Promise<void>;

  readonly email = computed(() => this.account()?.email ?? '');
  readonly isAdmin = computed(() => this.account() !== null);
  /** True until the password the account was created with has been replaced. */
  readonly usesDefaultPassword = computed(() => this.account()?.usesDefaultPassword ?? false);

  constructor() {
    this.initialised = this.token ? this.restore() : Promise.resolve();
  }

  /** Resolves once the stored session, if any, has been checked with the API. */
  async ready(): Promise<boolean> {
    await this.initialised;
    return this.isAdmin();
  }

  accessToken(): string | null {
    return this.token;
  }

  async signIn(email: string, password: string): Promise<void> {
    const response = await this.post('/auth/sign-in/email', { email, password });
    if (response.status === 401 || response.status === 403) {
      throw new AuthError('Wrong email or password.');
    }
    const token = response.ok ? await tokenOf(response) : null;
    if (!token) {
      throw new AuthError('Sign-in failed. Try again.');
    }

    this.setToken(token);
    const account = await this.fetchAccount();
    if (account === 'refused') {
      // A real account, but a student's: it gets no session in the panel.
      await this.signOut();
      throw new AuthError(NOT_AN_ADMIN);
    }
    if (!account) {
      this.setToken(null);
      throw new AuthError('Sign-in failed. Try again.');
    }
    this.account.set(account);
  }

  async signOut(): Promise<void> {
    if (this.token) {
      // Ends the session on the server too. Best effort: the local sign-out
      // happens regardless.
      await this.post('/auth/sign-out', {}).catch(() => undefined);
    }
    this.clear();
  }

  /** Forgets the session without calling the API, e.g. after it answered 401. */
  clear(): void {
    this.setToken(null);
    this.account.set(null);
  }

  /**
   * Replaces the password. Every other session of the account is ended; this
   * one continues with a fresh token.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await this.post('/auth/change-password', {
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (!response.ok) {
      throw new AuthError(
        response.status === 400 || response.status === 401
          ? 'The current password is not correct.'
          : 'The password could not be changed. Try again.',
      );
    }
    const token = await tokenOf(response);
    if (token) {
      this.setToken(token);
    }
    await this.refreshAccount();
  }

  /** Always succeeds from the caller's point of view: the API does not say whether the address exists. */
  async requestPasswordReset(email: string): Promise<void> {
    const response = await this.post('/auth/request-password-reset', { email });
    if (!response.ok && response.status !== 400) {
      throw new AuthError('The request could not be sent. Try again.');
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const response = await this.post('/auth/reset-password', { token, newPassword });
    if (!response.ok) {
      throw new AuthError(
        response.status === 400
          ? 'This link has expired or was already used. Ask for a new one.'
          : 'The password could not be changed. Try again.',
      );
    }
  }

  /** Re-reads the account, e.g. after the password changed. */
  async refreshAccount(): Promise<void> {
    const account = await this.fetchAccount();
    if (account && account !== 'refused') {
      this.account.set(account);
    }
  }

  private async restore(): Promise<void> {
    const account = await this.fetchAccount().catch(() => null);
    if (account && account !== 'refused') {
      this.account.set(account);
    } else if (account === 'refused') {
      this.clear();
    }
    // `null` here means the API could not be reached: the token is kept, and
    // the guard sends the user to the login page for now.
  }

  /** The account behind the current token; `refused` when it is not an administrator's or no longer valid. */
  private async fetchAccount(): Promise<AdminAccount | 'refused' | null> {
    const response = await fetch(`${this.api}/admin/account`, {
      headers: this.headers(),
      credentials: 'omit',
    });
    if (response.status === 401 || response.status === 403) {
      return 'refused';
    }
    return response.ok ? ((await response.json()) as AdminAccount) : null;
  }

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.api}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    }).catch(() => {
      throw new AuthError('The server could not be reached.');
    });
  }

  private headers(): Record<string, string> {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }

  private setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage is blocked: the session lasts until the tab is closed.
    }
  }
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The session token of a sign-in or password change: a response header, also repeated in the body. */
async function tokenOf(response: Response): Promise<string | null> {
  const header = response.headers.get('set-auth-token');
  if (header) {
    return header;
  }
  const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
  return typeof body?.token === 'string' && body.token !== '' ? body.token : null;
}
