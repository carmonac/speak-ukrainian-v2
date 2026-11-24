import { Injectable, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { Supabase } from './supabase';

export const NOT_AN_ADMIN = 'This account is not the administrator.';

/** Sign-in state of the control panel. Only the administrator may hold a session here. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(Supabase).client;
  private readonly session = signal<Session | null>(null);
  private readonly initialised: Promise<void>;

  readonly email = computed(() => this.session()?.user.email ?? '');
  readonly isAdmin = computed(() => isAdminSession(this.session()));

  constructor() {
    this.initialised = this.supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
    });
    this.supabase.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  /** Resolves once the stored session, if any, has been restored. */
  async ready(): Promise<boolean> {
    await this.initialised;
    return this.isAdmin();
  }

  /** The current access token, refreshed by the client when it is about to expire. */
  async accessToken(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        error.status === 400 ? 'Wrong email or password.' : 'Sign-in failed. Try again.',
      );
    }
    if (!isAdminSession(data.session)) {
      await this.supabase.auth.signOut();
      throw new Error(NOT_AN_ADMIN);
    }
    this.session.set(data.session);
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.session.set(null);
  }
}

function isAdminSession(session: Session | null): boolean {
  return (session?.user.app_metadata as { role?: string } | undefined)?.role === 'admin';
}
