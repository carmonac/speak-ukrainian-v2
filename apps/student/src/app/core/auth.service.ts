import { Injectable, computed, signal } from '@angular/core';
import { runtimeConfig } from './runtime-config';

export type SignUpOutcome = 'signed-in' | 'confirm-email';

/** Only the classroom reads this key; the control panel keeps its own. */
const STORAGE_KEY = 'su-student-session';

interface SessionUser {
  id: string;
  email: string;
  name: string;
}

interface StoredSession {
  token: string;
  user: SessionUser;
}

/** What the API answers to a sign-in or a sign-up. */
interface AuthResponse {
  token?: string | null;
  user?: Partial<SessionUser>;
  code?: string;
  message?: string;
}

/**
 * Sign-in state of the classroom.
 *
 * Talks to the API's authentication routes (`/api/auth/*`) directly. The
 * session is a token sent as `Authorization: Bearer`; cookies are never sent,
 * which keeps this session separate from the one of the control panel open in
 * the same browser.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = runtimeConfig().apiUrl;
  private readonly session = signal<StoredSession | null>(readStored());
  private readonly initialised: Promise<void>;

  readonly signedIn = computed(() => this.session() !== null);
  readonly userId = computed(() => this.session()?.user.id ?? null);
  readonly email = computed(() => this.session()?.user.email ?? '');
  /** The name given at registration, until the profile has been loaded. */
  readonly metadataName = computed(() => this.session()?.user.name ?? '');

  constructor() {
    this.initialised = this.session() ? this.restore() : Promise.resolve();
  }

  /** Resolves once the stored session, if any, has been checked with the API. */
  async ready(): Promise<boolean> {
    await this.initialised;
    return this.signedIn();
  }

  accessToken(): string | null {
    return this.session()?.token ?? null;
  }

  async signIn(email: string, password: string): Promise<void> {
    const response = await this.post('/auth/sign-in/email', { email, password });
    const body = await bodyOf(response);
    const session = response.ok ? sessionFrom(response, body) : null;
    if (!session) {
      throw new Error(
        response.status === 401
          ? 'Wrong email or password.'
          : response.status === 403
            ? (body.message ?? 'This account cannot sign in.')
            : 'Sign-in failed. Try again.',
      );
    }
    this.store(session);
  }

  async signUp(fullName: string, email: string, password: string): Promise<SignUpOutcome> {
    const response = await this.post('/auth/sign-up/email', { name: fullName, email, password });
    const body = await bodyOf(response);
    if (!response.ok) {
      throw new Error(
        /already.*exist|USER_ALREADY/i.test(`${body.code ?? ''} ${body.message ?? ''}`)
          ? 'An account with this email already exists. Sign in instead.'
          : (body.message ?? 'The account could not be created.'),
      );
    }
    // With email confirmation switched on there is a user but no session yet.
    const session = sessionFrom(response, body);
    if (!session) {
      return 'confirm-email';
    }
    this.store(session);
    return 'signed-in';
  }

  /** The API answers the same whether or not the address has an account. */
  async requestPasswordReset(email: string): Promise<void> {
    const response = await this.post('/auth/request-password-reset', { email });
    if (!response.ok && response.status !== 400) {
      throw new Error('The reset email could not be sent. Try again.');
    }
  }

  /** Sets a new password with the token of an e-mailed link. Ends every session of the account. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const response = await this.post('/auth/reset-password', { token, newPassword });
    if (!response.ok) {
      throw new Error(
        response.status === 400
          ? 'This reset link is not valid any more. Request a new one.'
          : 'The password could not be changed. Try again.',
      );
    }
    this.clear();
  }

  async signOut(): Promise<void> {
    if (this.session()) {
      // Ends the session on the server too. Best effort: the local sign-out
      // happens regardless.
      await this.post('/auth/sign-out', {}).catch(() => undefined);
    }
    this.clear();
  }

  /** Forgets the session without calling the API, e.g. after it answered 401. */
  clear(): void {
    this.store(null);
  }

  private async restore(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.api}/auth/get-session`, {
        headers: this.headers(),
        credentials: 'omit',
      });
    } catch {
      // The API could not be reached: keep the session and let the next call
      // decide. Signing the student out for a network blip would be worse.
      return;
    }
    const body = response.ok
      ? ((await response.json().catch(() => null)) as { user?: Partial<SessionUser> } | null)
      : null;
    const current = this.session();
    if (!body?.user?.id || !current) {
      // Answered, and there is no such session any more.
      this.clear();
      return;
    }
    this.store({ token: current.token, user: toUser(body.user) });
  }

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.api}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    }).catch(() => {
      throw new Error('The server could not be reached.');
    });
  }

  private headers(): Record<string, string> {
    const token = this.accessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private store(session: StoredSession | null): void {
    this.session.set(session);
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage is blocked: the session lasts until the tab is closed.
    }
  }
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    return parsed?.token && parsed.user?.id
      ? { token: parsed.token, user: toUser(parsed.user) }
      : null;
  } catch {
    return null;
  }
}

function toUser(user: Partial<SessionUser>): SessionUser {
  return { id: user.id ?? '', email: user.email ?? '', name: user.name ?? '' };
}

async function bodyOf(response: Response): Promise<AuthResponse> {
  return ((await response.json().catch(() => null)) as AuthResponse | null) ?? {};
}

/** The session of a sign-in or sign-up: the token is a response header, also repeated in the body. */
function sessionFrom(response: Response, body: AuthResponse): StoredSession | null {
  const token = response.headers.get('set-auth-token') ?? body.token ?? null;
  return token && body.user?.id ? { token, user: toUser(body.user) } : null;
}
